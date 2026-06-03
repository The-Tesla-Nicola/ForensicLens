
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import rateLimit from 'express-rate-limit';
import exifr from 'exifr';
import crypto from 'crypto';
import { performELA } from './src/services/forensics';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Extend JSON limit for high-res image base64
  app.use(express.json({ limit: '20mb' }));

  // Rate limiting
  const analysisLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many requests. Please wait before analyzing more images." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // API Routes
  app.get("/api/download-source", (req, res) => {
    try {
      const zip = new AdmZip();
      const projectRoot = process.cwd();
      
      // Include selected root files
      const filesToInclude = [
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "server.ts",
        "index.html",
        "metadata.json",
        ".env.example"
      ];

      filesToInclude.forEach(file => {
        const filePath = path.join(projectRoot, file);
        if (fs.existsSync(filePath)) {
          zip.addLocalFile(filePath);
        }
      });

      // Include entire src directory
      const srcPath = path.join(projectRoot, "src");
      if (fs.existsSync(srcPath)) {
        zip.addLocalFolder(srcPath, "src");
      }

      const zipBuffer = zip.toBuffer();
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename=ForensicGuard_Source.zip');
      res.send(zipBuffer);
    } catch (error) {
      console.error("Source Download Error:", error);
      res.status(500).send("Failed to generate source zip");
    }
  });

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BASE64_LENGTH = 20 * 1024 * 1024;

  app.post("/api/analyze", analysisLimiter, async (req, res) => {
    try {
      const { imageBase64, mimeType, deepScan } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
      }

      if (typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: "Invalid image format" });
      }

      if (imageBase64.length > MAX_BASE64_LENGTH) {
        return res.status(400).json({ error: "Image too large. Maximum 15MB." });
      }

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(imageBase64)) {
        return res.status(400).json({ error: "Invalid base64 encoding" });
      }

      const resolvedMimeType = mimeType || "image/jpeg";
      if (!ALLOWED_MIME_TYPES.includes(resolvedMimeType)) {
        return res.status(400).json({ error: `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` });
      }

      const FEW_SHOT_EXAMPLES = `
Here are reference examples to guide your analysis:

EXAMPLE 1 — REAL PHOTO:
A photograph of a cat sitting on a windowsill. Natural sunlight creating soft shadows.
EXIF data shows: Camera: Sony A7III, ISO 400, f/2.8, 1/125s.
Noise pattern: Natural grain, higher in shadows.
Verdict: Real (98% confidence)

EXAMPLE 2 — AI GENERATED:
A portrait of a woman with smooth, poreless skin. Background has warped bricks. Fingers appear fused.
EXIF: No camera data. Software field: "Midjourney".
Noise: Uniform across entire image, no natural grain pattern.
Verdict: AI-generated (97% confidence)

EXAMPLE 3 — EDITED PHOTO:
A landscape photo with obvious clone-stamped clouds. EXIF shows camera data but JPEG compression
artifacts are inconsistent near the edited region.
Verdict: Edited (85% confidence)
`;

      let prompt = `Act as an Elite Digital Image Forensics Expert.

${FEW_SHOT_EXAMPLES}

Now analyze the provided image following this protocol:

1. VISUAL ANALYSIS: Check anatomy, lighting, shadows, textures, background coherence
2. AI ARTIFACTS: Diffusion noise, GAN artifacts, synthetic bokeh, text rendering failures
3. COMPRESSION & METADATA: JPEG artifacts, EXIF presence/absence, software signatures
4. STATISTICAL ANALYSIS: Noise uniformity, edge coherence, color distribution
5. FINAL VERDICT

IMPORTANT RULES:
- If you are less than 60% confident, classify as "Mixed/Uncertain"
- Every evidence point must specify if it's STRONG, MODERATE, or WEAK evidence
- Do NOT guess. If you cannot determine, say so.
- Base your confidence level on: how many evidence points support the verdict vs contradict it

Provide your findings in this exact JSON structure:
{
  "classification": "AI-generated" | "Real" | "Edited" | "Mixed/Uncertain",
  "aiLikelihood": number (0-100),
  "realLikelihood": number (0-100),
  "editedLikelihood": number (0-100),
  "consistencyScore": number (0-100),
  "confidenceLevel": "Low" | "Medium" | "High",
  "keyEvidence": string[],
  "detectedIssues": string[],
  "mostLikelySource": string,
  "forensicSummary": string,
  "finalVerdict": string
}`;

      if (deepScan) {
        prompt = `You are a DEEP FORENSIC SCANNER. This is a HIGH-PRECISION analysis mode.

REQUIRED IN THIS MODE:
- Perform 3 independent analysis passes through your reasoning
- For each pass, write down what you see
- Compare the 3 passes and note any contradictions
- Only classify if at least 2 of 3 passes agree
- If they disagree, classify as "Mixed/Uncertain"

ADDITIONAL CHECKS:
1. PRNU/Sensor Noise: Check if noise pattern is consistent with camera sensor
2. Edge Gradient Analysis: Check if edges transition naturally or have sharp AI boundaries
3. Frequency Analysis: Describe frequency domain patterns (uniform grids suggest AI)
4. Color Matrix: Check if color filter array pattern is consistent

${FEW_SHOT_EXAMPLES}

Provide your findings in this exact JSON structure:
{
  "classification": "AI-generated" | "Real" | "Edited" | "Mixed/Uncertain",
  "aiLikelihood": number (0-100),
  "realLikelihood": number (0-100),
  "editedLikelihood": number (0-100),
  "consistencyScore": number (0-100),
  "confidenceLevel": "Low" | "Medium" | "High",
  "keyEvidence": string[],
  "detectedIssues": string[],
  "mostLikelySource": string,
  "forensicSummary": string,
  "finalVerdict": string
}`;
      }

      // Run ELA before Gemini
      let elaResult: { score: number | null; interpretation: string | null } = { score: null, interpretation: null };
      try {
        const buffer = Buffer.from(imageBase64, 'base64');
        const ela = await performELA(buffer, resolvedMimeType);
        elaResult = { score: ela.score, interpretation: ela.interpretation };
      } catch (elaErr) {
        console.warn("ELA analysis failed (non-critical):", elaErr);
      }

      const MAX_RETRIES = 1;
      let lastError: any;
      let analysis: any;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType || "image/jpeg",
                      data: imageBase64
                    }
                  }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  classification: { type: Type.STRING },
                  aiLikelihood: { type: Type.NUMBER },
                  realLikelihood: { type: Type.NUMBER },
                  editedLikelihood: { type: Type.NUMBER },
                  consistencyScore: { type: Type.NUMBER },
                  confidenceLevel: { type: Type.STRING },
                  keyEvidence: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  detectedIssues: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  mostLikelySource: { type: Type.STRING },
                  forensicSummary: { type: Type.STRING },
                  finalVerdict: { type: Type.STRING }
                },
                required: ["classification", "aiLikelihood", "realLikelihood", "editedLikelihood", "consistencyScore", "confidenceLevel", "keyEvidence", "detectedIssues", "mostLikelySource", "forensicSummary", "finalVerdict"]
              }
            }
          });

          try {
            analysis = JSON.parse(response.text || "{}");
            if (!analysis.classification) {
              throw new Error("Missing classification in response");
            }

            // Post-processing: enforce uncertainty for low confidence
            if (analysis.confidenceLevel === "Low" || 
                (analysis.aiLikelihood < 60 && analysis.realLikelihood < 60)) {
              analysis.classification = "Mixed/Uncertain";
              analysis.finalVerdict = "Insufficient evidence to make a definitive classification. Further analysis recommended.";
            }

            // Normalize likelihoods to sum to ~100
            const total = analysis.aiLikelihood + analysis.realLikelihood + analysis.editedLikelihood;
            if (total > 0) {
              analysis.aiLikelihood = Math.round((analysis.aiLikelihood / total) * 100);
              analysis.realLikelihood = Math.round((analysis.realLikelihood / total) * 100);
              analysis.editedLikelihood = Math.round((analysis.editedLikelihood / total) * 100);
            }
          } catch (parseError) {
            console.error("Gemini JSON parse failed:", response.text?.substring(0, 200));
            return res.status(502).json({
              error: "Analysis engine returned malformed response",
              fallback: true
            });
          }

          break;
        } catch (err: any) {
          lastError = err;
          if (err.status === 429 || err.status === 503) {
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
          }
          throw err;
        }
      }

      res.json({
        ...analysis,
        elaScore: elaResult.score,
        elaInterpretation: elaResult.interpretation,
      });

    } catch (error: any) {
      console.error("Analysis Error:", error);
      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        return res.status(504).json({ error: "Analysis timed out. Please try a smaller image." });
      }
      if (error.status === 429) {
        return res.status(429).json({ error: "API rate limit exceeded. Please wait and try again." });
      }
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  // Metadata extraction endpoint
  app.post("/api/metadata", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "No image provided" });

      const buffer = Buffer.from(imageBase64, 'base64');
      const metadata = await exifr.parse(buffer, {
        full: true,
        multiSegment: true,
        icc: true,
        xmp: true,
        tiff: true,
        jfif: true,
        ihdr: true,
      } as any);

      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      const AI_SOFTWARE_SIGNATURES = [
        'midjourney', 'stable diffusion', 'dall-e', 'dalle', 'firefly',
        'novelai', 'artbreeder', 'gan', 'generative', 'comfyui',
        'automatic1111', 'fooocus', 'leonardo', 'dreamstudio'
      ];

      const softwareTraces: Array<{ field: string; value: string; aiRelated: boolean }> = [];
      if (metadata?.Software) {
        const sw = metadata.Software.toLowerCase();
        if (AI_SOFTWARE_SIGNATURES.some(sig => sw.includes(sig))) {
          softwareTraces.push({ field: 'Software', value: metadata.Software, aiRelated: true });
        } else {
          softwareTraces.push({ field: 'Software', value: metadata.Software, aiRelated: false });
        }
      }
      if (metadata?.xmp?.CreatorTool) {
        const ct = metadata.xmp.CreatorTool.toLowerCase();
        if (AI_SOFTWARE_SIGNATURES.some(sig => ct.includes(sig))) {
          softwareTraces.push({ field: 'XMP:CreatorTool', value: metadata.xmp.CreatorTool, aiRelated: true });
        }
      }

      res.json({
        exif: metadata,
        hash,
        softwareTraces,
        hasExif: !!metadata,
        dimensions: metadata?.width && metadata?.height ? { width: metadata.width, height: metadata.height } : null,
        gps: metadata?.latitude && metadata?.longitude ? { lat: metadata.latitude, lng: metadata.longitude } : null,
      });

    } catch (err: any) {
      console.error("Metadata extraction error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use('/api/analyze', (req, res, next) => {
    req.setTimeout(35000);
    next();
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Forensic Server running on http://localhost:${PORT}`);
  });
}

startServer();
