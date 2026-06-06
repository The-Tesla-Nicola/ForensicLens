import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import sharp from 'sharp';
import exifr from 'exifr';

dotenv.config();

// --- Config ---
const NV_API_KEY = process.env.NV_API_KEY || "";
const NV_BASE_URL = process.env.NV_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NV_MODEL = process.env.NV_MODEL || "meta/llama-3.2-90b-vision-instruct";
const HF_API_KEY = process.env.hugging_face_api || "";

// --- Fetch with retry (handles transient ConnectTimeoutError) ---
async function fetchWithRetry(url: string, opts: any, retries = 2, delayMs = 3000): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, opts);
    } catch (err: any) {
      lastErr = err;
      const isTimeout = err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
      if (isTimeout && i < retries) {
        console.log(`  Retry ${i + 1}/${retries} after timeout...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// --- HuggingFace AI Detector (Aya Vision 32B, 2-pass majority vote) ---
async function detectAIImage(base64: string, mimeType: string): Promise<{ label: string; confidence: number; raw: string }> {
  if (!HF_API_KEY) return { label: 'unknown', confidence: 0, raw: '' };

  // Resize for HF API limit
  let smallBase64 = base64;
  try {
    const buffer = Buffer.from(base64, 'base64');
    const resized = await sharp(buffer).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
    smallBase64 = resized.toString('base64');
  } catch { /* use original */ }

  const hfPrompt = `You are an expert digital image forensic analyst. Examine this image VERY carefully and classify it.

ANALYSIS INSTRUCTIONS:
1. SKIN TEXTURE: Real = pores, blemishes, uneven tone. AI = unnaturally smooth, porcelain-like.
2. EYES: Real = subtle asymmetry, natural iris variation. AI = mismatched reflections, too-perfect.
3. HAIR: Real = flyaway strands, uneven thickness. AI = too-regular, clumpy, merging.
4. TEXT: AI garbles text into nonsense. Real has readable text.
5. HANDS: AI = extra fingers, fused digits, impossible joints.
6. BACKGROUND: AI = repeating patterns, morphing objects, impossible geometry.
7. LIGHTING: Real = consistent shadow direction. AI = shadows going multiple directions.
8. EDGES: Edited = edge halos, clone stamp duplicates, cut/paste boundaries.

Some AI images are VERY convincing. Look for SUBTLE tells.

Classify as:
- "Real": Genuine photograph with natural imperfections
- "AI-generated": Created by generative AI
- "Edited": Real photo that was digitally manipulated

Respond with ONLY this JSON:
{"label":"Real or AI-generated or Edited","confidence":0.0-1.0,"reasons":["reason 1","reason 2"]}`;

  const votes: string[] = [];

  for (let pass = 0; pass < 2; pass++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body = JSON.stringify({
          model: 'CohereLabs/aya-vision-32b:fastest',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: hfPrompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${smallBase64}` } }
            ]
          }],
          stream: false,
          temperature: 0.1 + (pass * 0.2)
        });

        const resp = await fetchWithRetry('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${HF_API_KEY}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(90000)
        });

        if (!resp.ok) {
          if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); continue; }
          break;
        }

        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        const parsed = extractJsonFromResponse(content);
        if (parsed && parsed.label && ["Real", "AI-generated", "Edited"].includes(parsed.label)) {
          votes.push(parsed.label);
          break;
        }
        break;
      } catch (err: any) {
        if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
        break;
      }
    }
  }

  if (votes.length === 0) return { label: 'unknown', confidence: 0, raw: '' };

  const counts: Record<string, number> = {};
  for (const v of votes) counts[v] = (counts[v] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { label: sorted[0][0], confidence: sorted[0][1] / votes.length, raw: votes.join(',') };
}

// --- NVIDIA API: Single analysis pass ---
async function runAnalysisPass(prompt: string, systemMsg: string, dataUri: string, temperature: number): Promise<any> {
  // Resize for NVIDIA API
  let optimizedDataUri = dataUri;
  try {
    const match = dataUri.match(/^data:(.*);base64,(.*)$/);
    if (match) {
      const buffer = Buffer.from(match[2], 'base64');
      const resized = await sharp(buffer).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      optimizedDataUri = `data:image/jpeg;base64,${resized.toString('base64')}`;
    }
  } catch { /* use original */ }

  const resp = await fetchWithRetry(`${NV_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${NV_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: NV_MODEL,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: optimizedDataUri } }
        ]}
      ],
      temperature,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(180000)
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw { status: resp.status, message: `NVIDIA API error ${resp.status}: ${errBody}` };
  }

  const data = await resp.json();
  const rawText = data?.choices?.[0]?.message?.content || "{}";
  let analysis = extractJsonFromResponse(rawText);
  if (!analysis) analysis = parseNvidiaResponse(rawText);
  if (!analysis.classification) throw new Error("Failed to extract classification from response");
  return analysis;
}

// --- Post-process: normalize likelihoods, reconcile ---
function postProcessAnalysis(analysis: any): any {
  analysis.aiLikelihood = Math.min(100, Math.max(0, analysis.aiLikelihood ?? 50));
  analysis.realLikelihood = Math.min(100, Math.max(0, analysis.realLikelihood ?? 0));
  analysis.editedLikelihood = Math.min(100, Math.max(0, analysis.editedLikelihood ?? 0));
  analysis.consistencyScore = Math.min(100, Math.max(0, analysis.consistencyScore ?? 0));
  if (!analysis.classification) analysis.classification = "Mixed/Uncertain";
  if (!analysis.confidenceLevel) analysis.confidenceLevel = "Medium";
  if (!analysis.keyEvidence) analysis.keyEvidence = [];
  if (!analysis.detectedIssues) analysis.detectedIssues = [];

  // Normalize to sum ~100
  let total = analysis.aiLikelihood + analysis.realLikelihood + analysis.editedLikelihood;
  if (total > 0 && isFinite(total)) {
    analysis.aiLikelihood = Math.round((analysis.aiLikelihood / total) * 100);
    analysis.realLikelihood = Math.round((analysis.realLikelihood / total) * 100);
    analysis.editedLikelihood = Math.round((analysis.editedLikelihood / total) * 100);
    const diff = 100 - (analysis.aiLikelihood + analysis.realLikelihood + analysis.editedLikelihood);
    if (diff !== 0) {
      const sorted = [
        { key: 'ai', val: analysis.aiLikelihood },
        { key: 'real', val: analysis.realLikelihood },
        { key: 'edited', val: analysis.editedLikelihood }
      ].sort((a, b) => b.val - a.val);
      if (sorted[0].key === 'ai') analysis.aiLikelihood += diff;
      else if (sorted[0].key === 'real') analysis.realLikelihood += diff;
      else analysis.editedLikelihood += diff;
    }
  } else {
    analysis.aiLikelihood = 33; analysis.realLikelihood = 34; analysis.editedLikelihood = 33;
    analysis.classification = "Mixed/Uncertain";
  }

  // Reconcile if dominant
  const sorted = [
    { key: 'AI-generated', val: analysis.aiLikelihood },
    { key: 'Real', val: analysis.realLikelihood },
    { key: 'Edited', val: analysis.editedLikelihood }
  ].sort((a, b) => b.val - a.val);

  if (sorted[0].val >= 70 && (sorted[0].val - sorted[1].val) >= 20) {
    analysis.classification = sorted[0].key;
  } else if (sorted[0].val < 40) {
    analysis.classification = "Mixed/Uncertain";
  }

  return analysis;
}

function majorityClassification(results: any[]): string {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function mergeAnalyses(results: any[], majority: string): any {
  const majorityResult = results.find(r => r.classification === majority) || results[0];
  const avg = (key: string) => Math.round(results.reduce((s, r) => s + (r[key] || 0), 0) / results.length);
  return {
    ...majorityResult,
    classification: majority,
    aiLikelihood: avg('aiLikelihood'),
    realLikelihood: avg('realLikelihood'),
    editedLikelihood: avg('editedLikelihood'),
    consistencyScore: avg('consistencyScore'),
    _ensemblePasses: results.length,
  };
}

// --- Error Level Analysis ---
async function performELA(buffer: Buffer, mimeType: string): Promise<{ score: number | null; interpretation: string | null }> {
  try {
    const reSavedBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
    const original = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const resaved = await sharp(reSavedBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const origData = original.data;
    const resavedData = resaved.data;
    const pixelCount = origData.length / 4;

    let sum = 0;
    const diffs = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const luminance = 0.299 * Math.abs(origData[idx] - resavedData[idx])
        + 0.587 * Math.abs(origData[idx + 1] - resavedData[idx + 1])
        + 0.114 * Math.abs(origData[idx + 2] - resavedData[idx + 2]);
      diffs[i] = luminance;
      sum += luminance;
    }

    const mean = pixelCount > 0 ? sum / pixelCount : 0;
    let varianceSum = 0;
    for (let i = 0; i < pixelCount; i++) varianceSum += Math.pow(diffs[i] - mean, 2);
    const stdDev = pixelCount > 0 ? Math.sqrt(varianceSum / pixelCount) : 0;

    let interpretation = "";
    if (stdDev < 1.0) interpretation = "very_uniform";
    else if (stdDev < 2.0) interpretation = "uniform";
    else if (stdDev < 3) interpretation = "low";
    else if (stdDev < 8) interpretation = "normal";
    else interpretation = "high";

    return { score: stdDev, interpretation };
  } catch {
    return { score: null, interpretation: null };
  }
}

// --- JSON parsing helpers ---
function extractJsonFromResponse(text: string): any {
  try { const p = JSON.parse(text); if (p.classification) return p; } catch {}
  const cb = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (cb) try { const p = JSON.parse(cb[1].trim()); if (p.classification) return p; } catch {}
  const jm = text.match(/\{[\s\S]*"classification"[\s\S]*\}/);
  if (jm) try { const p = JSON.parse(jm[0]); if (p.classification) return p; } catch {}
  return null;
}

function parseNvidiaResponse(text: string): any {
  const result: any = {
    classification: "Mixed/Uncertain", aiLikelihood: 50, realLikelihood: 0,
    editedLikelihood: 0, consistencyScore: 0, confidenceLevel: "Low",
    keyEvidence: [], detectedIssues: [], mostLikelySource: "unknown",
    forensicSummary: "Failed to parse analysis response", finalVerdict: "Analysis incomplete"
  };

  const cls = text.match(/"classification"\s*:\s*"([^"]*)"/i);
  if (cls?.[1] && ["AI-generated", "Real", "Edited", "Mixed/Uncertain"].includes(cls[1].trim())) result.classification = cls[1].trim();

  const ai = text.match(/"aiLikelihood"\s*:\s*(\d+)/i);
  if (ai?.[1]) result.aiLikelihood = Math.min(100, Math.max(0, parseInt(ai[1])));

  const rl = text.match(/"realLikelihood"\s*:\s*(\d+)/i);
  if (rl?.[1]) result.realLikelihood = Math.min(100, Math.max(0, parseInt(rl[1])));

  const ed = text.match(/"editedLikelihood"\s*:\s*(\d+)/i);
  if (ed?.[1]) result.editedLikelihood = Math.min(100, Math.max(0, parseInt(ed[1])));

  const conf = text.match(/"confidenceLevel"\s*:\s*"([^"]*)"/i);
  if (conf?.[1] && ["Low", "Medium", "High"].includes(conf[1].trim())) result.confidenceLevel = conf[1].trim();

  const ev = text.match(/"keyEvidence"\s*:\s*\[([^\]]*)\]/i);
  if (ev?.[1]) result.keyEvidence = (ev[1].match(/"[^"]*"/g) || []).map(s => s.replace(/"/g, '').trim()).filter(Boolean);

  const iss = text.match(/"detectedIssues"\s*:\s*\[([^\]]*)\]/i);
  if (iss?.[1]) result.detectedIssues = (iss[1].match(/"[^"]*"/g) || []).map(s => s.replace(/"/g, '').trim()).filter(Boolean);

  const src = text.match(/"mostLikelySource"\s*:\s*"([^"]*)"/i);
  if (src?.[1]) result.mostLikelySource = src[1].trim();

  const sum = text.match(/"forensicSummary"\s*:\s*"([^"]*)"/i);
  if (sum?.[1]) result.forensicSummary = sum[1].trim();

  const ver = text.match(/"finalVerdict"\s*:\s*"([^"]*)"/i);
  if (ver?.[1]) result.finalVerdict = ver[1].trim();

  return result;
}

// --- Reverse Prompt JSON parser ---
function parseReversePromptJson(rawText: string): any {
  let result: any = null;
  try { result = JSON.parse(rawText); } catch {}
  if (!result?.prompt) {
    const cb = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (cb) try { result = JSON.parse(cb[1].trim()); } catch {}
  }
  if (!result?.prompt) {
    const jm = rawText.match(/\{[\s\S]*"prompt"[\s\S]*\}/);
    if (jm) try { result = JSON.parse(jm[0]); } catch {}
  }
  return result?.prompt ? result : null;
}

// --- Resize helper ---
async function resizeImage(dataUri: string, maxWidth = 768, quality = 80): Promise<string> {
  try {
    const match = dataUri.match(/^data:(.*);base64,(.*)$/);
    if (!match) return dataUri;
    const buffer = Buffer.from(match[2], 'base64');
    const resized = await sharp(buffer).resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch { return dataUri; }
}

// --- Main server ---
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: '20mb' }));

  const analysisLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: "Too many requests." });

  const apiKeyGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-api-key'] !== NV_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  app.use('/api/analyze', (req, _res, next) => { req.setTimeout(600000); next(); });

  // --- Source download ---
  app.get("/api/download-source", apiKeyGuard, (_req, res) => {
    try {
      const zip = new AdmZip();
      const root = process.cwd();
      ["package.json", "tsconfig.json", "vite.config.ts", "server.ts", "index.html", "metadata.json", ".env.example"].forEach(f => {
        const p = path.join(root, f); if (fs.existsSync(p)) zip.addLocalFile(p);
      });
      const srcPath = path.join(root, "src");
      if (fs.existsSync(srcPath)) zip.addLocalFolder(srcPath, "src");
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename=ForensicTrace_Source.zip');
      res.send(zip.toBuffer());
    } catch { res.status(500).send("Failed to generate source zip"); }
  });

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

  // --- Analysis prompt ---
  const ANALYSIS_PROMPT = `You are a forensic image analyst. Classify this image as REAL, AI-GENERATED, or EDITED.

ABSOLUTE RULES:
- Professional photography is REAL even if it looks perfect
- Color grading, filters, dramatic lighting are NORMAL in real photography
- NEVER classify based on how "perfect" or "unusual" an image looks
- ONLY classify as AI-generated if you find SPECIFIC STRUCTURAL ERRORS

CLASSIFICATION:
1. REAL: Physically consistent photograph. CAN have perfect lighting, smooth skin, dramatic colors.
2. AI-GENERATED: Find SPECIFIC STRUCTURAL ERRORS:
   * ACCESSORIES: Collar buckle that doesn't connect, floating tag, asymmetric frames
   * HAIR: Edges merging into background, "helmet" quality
   * EYES: Different reflection patterns in left vs right eye
   * HANDS: Wrong finger count, impossible joints
   * TEXT: Garbled/nonsensical text
   * BACKGROUND: Warping buildings, repeating patterns, impossible perspective
   * EDGES: Objects subtly blending into surroundings
3. EDITED: Visible clone stamp, edge halos, cut/paste boundaries. Color grading alone = Real.
4. MIXED/UNCERTAIN: Only when evidence genuinely conflicts.

IMPORTANT: Do NOT call it AI-generated because:
- No EXIF metadata (websites strip EXIF)
- JPEG compression artifacts (blockiness, ringing)
- Small/low resolution
- Looks "too perfect"

Respond with ONLY this JSON:
{"classification":"Real or AI-generated or Edited or Mixed/Uncertain","aiLikelihood":0-100,"realLikelihood":0-100,"editedLikelihood":0-100,"consistencyScore":0-100,"confidenceLevel":"Low or Medium or High","keyEvidence":["observation 1","observation 2"],"detectedIssues":["issue 1"],"mostLikelySource":"source","forensicSummary":"2-3 sentences","finalVerdict":"one clear sentence"}`;

  const DEEP_SCAN_PROMPT = `You are conducting a DEEP FORENSIC ANALYSIS. Perform THREE independent passes:

PASS 1 - PHYSICAL & ANATOMICAL: Lighting, shadows, perspective, anatomy, physics
PASS 2 - TECHNICAL ARTIFACTS: AI signatures, diffusion patterns, GAN artifacts, compression
PASS 3 - PROVENANCE: EXIF authenticity, sensor noise, file structure

${ANALYSIS_PROMPT}

DEEP SCAN CONSTRAINTS:
- Each pass independently classifies
- Final = majority agreement
- Weight definitive errors heavily
- Distinguish compression artifacts from AI artifacts`;

  // --- Main analysis endpoint ---
  app.post("/api/analyze", analysisLimiter, async (req, res) => {
    try {
      const { imageBase64, mimeType, deepScan, extractStyle } = req.body;

      if (!imageBase64 || typeof imageBase64 !== 'string') return res.status(400).json({ error: "No image provided" });
      if (imageBase64.length > MAX_BASE64_LENGTH) return res.status(400).json({ error: "Image too large. Max 15MB." });
      if (imageBase64.length < 100) return res.status(400).json({ error: "Image data too small." });
      if (!/^[A-Za-z0-9+/\n]*={0,2}$/.test(imageBase64)) return res.status(400).json({ error: "Invalid base64 encoding" });

      const resolvedMimeType = mimeType || "image/jpeg";
      if (!ALLOWED_MIME_TYPES.includes(resolvedMimeType)) return res.status(400).json({ error: `Unsupported type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` });

      let prompt = deepScan ? DEEP_SCAN_PROMPT : ANALYSIS_PROMPT;
      if (extractStyle) prompt += `\n\nSTYLE ADDENDUM: After classification, add style insights if confident: estimated style/medium, lighting, composition.`;

      // ELA
      let elaResult: { score: number | null; interpretation: string | null } = { score: null, interpretation: null };
      try {
        const buffer = Buffer.from(imageBase64, 'base64');
        elaResult = await performELA(buffer, resolvedMimeType);
      } catch (elaErr) { console.warn("ELA failed:", elaErr); }

      // HF detector (parallel)
      const hfPromise = detectAIImage(imageBase64, resolvedMimeType);

      // ELA evidence for prompt
      let evidenceContext = '';
      if (elaResult.score !== null && elaResult.interpretation !== null) {
        evidenceContext += `\n\n## ELA: Score ${elaResult.score.toFixed(2)} (${elaResult.interpretation})`;
        if (elaResult.interpretation === 'very_uniform') evidenceContext += `\nWARNING: Very uniform ELA. Look extra carefully for AI artifacts.`;
      }

      const dataUri = `data:${resolvedMimeType};base64,${imageBase64}`;
      const systemMsg = "You are a forensic image analyst. Respond with ONLY a valid JSON object. No markdown, no code blocks.";

      // NVIDIA analysis
      const ENSEMBLE_PASSES = deepScan ? 3 : 1;
      const passResults: any[] = [];

      for (let pass = 0; pass < ENSEMBLE_PASSES; pass++) {
        const focusAreas = [
          'anatomy, physics, lighting, shadows, depth consistency',
          'textures, noise, compression, AI diffusion signatures, clone artifacts',
          'objects, text, composition, geometry, perspective'
        ];
        let passPrompt = deepScan ? prompt.replace('NOW ANALYZE THE PROVIDED IMAGE',
          `PASS ${pass + 1}/${ENSEMBLE_PASSES}: Focus: ${focusAreas[pass % 3]}`) : prompt;
        if (evidenceContext) passPrompt += evidenceContext;

        let analysis: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            analysis = await runAnalysisPass(passPrompt, systemMsg, dataUri, deepScan ? 0.5 : 0.1);
            break;
          } catch (err: any) {
            lastError = err;
            if ((err.status === 429 || err.status === 503) && attempt < 2) {
              await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
              continue;
            }
            throw err;
          }
        }
        if (!analysis) throw lastError || new Error("Analysis failed");
        passResults.push(postProcessAnalysis(analysis));
      }

      const finalAnalysis = passResults.length === 1
        ? passResults[0]
        : mergeAnalyses(passResults, majorityClassification(passResults));

      // Await HF + EXIF (parallel signals)
      const hfDetection = await hfPromise;

      let hasCameraExif = false;
      try {
        const buffer = Buffer.from(imageBase64, 'base64');
        const metadata = await exifr.parse(buffer, { full: true } as any);
        if (metadata?.Make || metadata?.Model || metadata?.LensModel || metadata?.Software) hasCameraExif = true;
      } catch { /* no exif */ }

      const elaVeryUniform = elaResult.interpretation === 'very_uniform';
      const elaUniform = elaResult.interpretation === 'uniform';
      const nvClass = finalAnalysis.classification;

      // --- Combined voting: NVIDIA + HF + ELA + EXIF ---
      if (hasCameraExif && nvClass !== 'Real') {
        // EXIF camera data → Real
        finalAnalysis.classification = 'Real';
        finalAnalysis.realLikelihood = Math.max(80, finalAnalysis.realLikelihood);
      } else if (elaVeryUniform && !hasCameraExif && hfDetection.label === 'AI-generated' && (nvClass === 'Real' || nvClass === 'Mixed/Uncertain')) {
        // ELA + HF agree AI → override
        finalAnalysis.classification = 'AI-generated';
        finalAnalysis.aiLikelihood = Math.max(75, finalAnalysis.aiLikelihood);
      } else if (elaResult.score !== null && elaResult.score < 0.7 && !hasCameraExif && hfDetection.label === 'AI-generated') {
        // Extremely low ELA + HF AI → override
        finalAnalysis.classification = 'AI-generated';
        finalAnalysis.aiLikelihood = Math.max(85, finalAnalysis.aiLikelihood);
      } else if (elaVeryUniform && !hasCameraExif && nvClass === 'Real' && finalAnalysis.realLikelihood < 50) {
        // ELA uniform + weak NV → override
        finalAnalysis.classification = 'AI-generated';
        finalAnalysis.aiLikelihood = Math.max(70, finalAnalysis.aiLikelihood);
      } else if (elaUniform && !hasCameraExif && nvClass === 'Real' && finalAnalysis.realLikelihood < 60) {
        finalAnalysis._elaSuspicious = true;
      } else if (hfDetection.label !== 'unknown' && hfDetection.label === nvClass) {
        // Both agree → boost
        if (nvClass === 'Real') finalAnalysis.realLikelihood = Math.min(100, finalAnalysis.realLikelihood + 10);
        else if (nvClass === 'AI-generated') finalAnalysis.aiLikelihood = Math.min(100, finalAnalysis.aiLikelihood + 10);
        else if (nvClass === 'Edited') finalAnalysis.editedLikelihood = Math.min(100, finalAnalysis.editedLikelihood + 10);
      }

      // --- Reverse prompt for AI/Edited images ---
      let reversePromptResult: any = null;
      if (finalAnalysis.classification === 'AI-generated' || finalAnalysis.classification === 'Edited') {
        try {
          const revDataUri = await resizeImage(dataUri);
          const revResponse = await fetchWithRetry(`${NV_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${NV_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: NV_MODEL,
              messages: [
                { role: "system", content: "You are an expert art and photography analyst. Respond with ONLY a valid JSON object." },
                { role: "user", content: [
                  { type: "text", text: `Analyze this image's artistic composition and describe it as a detailed photography/art direction brief.\n\nInclude: subject description, art style, camera lens, lighting setup, color palette, mood, and quality details.\n\nReturn ONLY this JSON:\n{"prompt":"your detailed description","style":"art style","confidence":"Low or Medium or High","notes":"brief observation"}` },
                  { type: "image_url", image_url: { url: revDataUri } }
                ]}
              ],
              temperature: 0.3,
              max_tokens: 1024,
            }),
            signal: AbortSignal.timeout(180000)
          });

          if (revResponse.ok) {
            const revData = await revResponse.json();
            const revRaw = revData?.choices?.[0]?.message?.content || '';
            reversePromptResult = parseReversePromptJson(revRaw);
            if (!reversePromptResult) {
              reversePromptResult = { prompt: revRaw.trim() || "Could not generate prompt", style: "unknown", confidence: "Low", notes: "Unstructured response" };
            }
          }
        } catch (revErr) { console.warn("Reverse prompt failed:", revErr); }
      }

      res.json({
        ...finalAnalysis,
        reversePrompt: reversePromptResult?.prompt || null,
        reversePromptStyle: reversePromptResult?.style || null,
        reversePromptConfidence: reversePromptResult?.confidence || null,
        hfDetection: hfDetection.label !== 'unknown' ? { label: hfDetection.label, confidence: Math.round(hfDetection.confidence * 100) } : null,
        elaScore: elaResult.score,
        elaInterpretation: elaResult.interpretation,
      });

    } catch (error: any) {
      console.error("Analysis Error:", error);
      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') return res.status(504).json({ error: "Analysis timed out." });
      if (error.status === 429) return res.status(429).json({ error: "API rate limit exceeded." });
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  // --- Metadata extraction ---
  app.post("/api/metadata", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "No image provided" });

      const buffer = Buffer.from(imageBase64, 'base64');
      const metadata = await exifr.parse(buffer, { full: true, multiSegment: true, icc: true, xmp: true, tiff: true, jfif: true, ihdr: true } as any);
      const hash = createHash('sha256').update(buffer).digest('hex');

      const AI_SOFTWARE_SIGNATURES = [
        'midjourney', 'stable diffusion', 'dall-e', 'dalle', 'firefly',
        'novelai', 'artbreeder', 'gan', 'generative', 'comfyui',
        'automatic1111', 'fooocus', 'leonardo', 'dreamstudio'
      ];

      const softwareTraces: Array<{ field: string; value: string; aiRelated: boolean }> = [];
      if (metadata?.Software) {
        const sw = metadata.Software.toLowerCase();
        softwareTraces.push({ field: 'Software', value: metadata.Software, aiRelated: AI_SOFTWARE_SIGNATURES.some(sig => sw.includes(sig)) });
      }
      if (metadata?.xmp?.CreatorTool) {
        const ct = metadata.xmp.CreatorTool.toLowerCase();
        if (AI_SOFTWARE_SIGNATURES.some(sig => ct.includes(sig))) {
          softwareTraces.push({ field: 'XMP:CreatorTool', value: metadata.xmp.CreatorTool, aiRelated: true });
        }
      }

      res.json({
        exif: metadata, hash, softwareTraces, hasExif: !!metadata,
        dimensions: metadata?.width && metadata?.height ? { width: metadata.width, height: metadata.height } : null,
        gps: metadata?.latitude && metadata?.longitude ? { lat: metadata.latitude, lng: metadata.longitude } : null,
      });
    } catch (err: any) {
      console.error("Metadata error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Reverse prompt endpoint ---
  app.post("/api/reverse-prompt", analysisLimiter, async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "No image provided" });

      const dataUri = await resizeImage(`data:${mimeType || "image/jpeg"};base64,${imageBase64}`);

      const resp = await fetchWithRetry(`${NV_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${NV_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: NV_MODEL,
          messages: [
            { role: "system", content: "You are an expert art and photography analyst. Respond with ONLY a valid JSON object." },
            { role: "user", content: [
              { type: "text", text: `Analyze this image's artistic composition and describe it as a detailed photography/art direction brief.\n\nInclude: subject description, art style, camera lens, lighting setup, color palette, mood, and quality details.\n\nReturn ONLY this JSON:\n{"prompt":"your detailed description","style":"art style","confidence":"Low or Medium or High","notes":"brief observation"}` },
              { type: "image_url", image_url: { url: dataUri } }
            ]}
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(180000)
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw { status: resp.status, message: `NVIDIA API error ${resp.status}: ${errBody}` };
      }

      const data = await resp.json();
      const rawText = data?.choices?.[0]?.message?.content || "";
      const result = parseReversePromptJson(rawText) || { prompt: rawText.trim() || "Could not generate prompt", style: "unknown", confidence: "Low", notes: "Unstructured response" };
      res.json(result);

    } catch (err: any) {
      console.error("Reverse prompt error:", err);
      if (err.status === 429) return res.status(429).json({ error: "API rate limit exceeded." });
      res.status(500).json({ error: err.message || "Failed to generate reverse prompt" });
    }
  });

  // --- Vite dev server / static files ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`ForensicTrace running on http://localhost:${PORT}`));
}

startServer();
