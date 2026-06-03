
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import rateLimit from 'express-rate-limit';

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

      let prompt = `Act as an Elite Digital Image Forensics Expert and AI-Generated Content Detection Analyst.

Analyze the given image and perform a rigorous, step-by-step forensic investigation to determine its origin.

Use this 7-step forensic analysis protocol:

STEP 1 — VISUAL FORENSIC ANALYSIS
Inspect for anatomical inconsistencies (fingers, limbs, facial asymmetry, eyes), texture artifacts (over-smooth skin, artificial fabric/hair), lighting/shadow inconsistencies, background integrity (warped structures, repeated patterns), and depth/perspective distortions.

STEP 2 — AI ARTIFACT DETECTION
Detect generation signatures: diffusion artifacts, GAN texture patterns, checkerboard artifacts, noise inconsistency, synthetic bokeh, hallucinated objects, or text rendering failures. Identify if it looks like Midjourney, Stable Diffusion, DALL·E, Flux.

STEP 3 — IMAGE COMPRESSION & METADATA
Analyze JPEG compression, EXIF metadata, camera evidence, software traces, and metadata tampering. Determine if metadata is authentic, stripped, or suggests manipulation.

STEP 4 — STATISTICAL FORENSICS
Perform logical statistical image analysis (pixel-level noise check, frequency domain, PRNU/sensor-trace likelihood, edge coherence). 

STEP 5 — CONTEXTUAL AUTHENTICITY CHECK
Evaluate contextual realism (human posture, environmental coherence, physics of objects/clothing).

STEP 6 — FINAL VERDICT AND SCORING
Calculate likelihood percentages for "AI-generated", "Real", "Edited", and "Uncertain". Provide a final classification and a consistency score (0-100).

STEP 7 — PROFESSIONAL FORENSIC SUMMARY
Generate a concise expert summary suitable for high-stakes investigative review.

Provide your findings in the following JSON structure:
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
        prompt += `\n\n[DENSE-SCAN ENABLED] Perform the highest-precision forensic analysis. Pay obsessive attention to PRNU signatures, anomalous edge-gradient discontinuities, generative pattern signatures, and possible latent noise pattern artifacts commonly found in AI-models. Be more critical and strictly analytical.`;
      }

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

      const analysis = JSON.parse(response.text || "{}");
      res.json(analysis);

    } catch (error: any) {
      console.error("Analysis Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Forensic Server running on http://localhost:${PORT}`);
  });
}

startServer();
