# FORENSICTRACE — EXECUTION PLAN
### Every file, every edit, every command

---

## TIER 0 — FOUNDATION (Week 1-2, ~22 hours)

---

### DAY 1 — Security & Bug Fixes (3 hours)

---

#### TASK 1.1: Remove live API key from repo (10 min)

**Files**: `.gitignore`

**Actions**:
```
1. Open `.gitignore`
2. Add line: .env
3. Save

Terminal:
  git rm --cached .env
  git add .gitignore
```

**What changed**: `.env` is no longer tracked. Existing commit still has old key — user needs to rotate at https://aistudio.google.com

---

#### TASK 1.2: Fix Gemini model name (5 min)

**File**: `server.ts`

**Change**:
```
Line 123:
  model: "gemini-3-flash-preview",
→ model: "gemini-2.0-flash",
```

**Why**: `gemini-3-flash-preview` doesn't exist. Correct model for structured output + vision is `gemini-2.0-flash`.

---

#### TASK 1.3: Remove dead import (5 min)

**File**: `src/App.tsx`

**Change**:
```
Line 38:
  import MetadataInspector from './components/MetadataInspector';
→ (delete line)
```

**Also check**: Search for any use of `<MetadataInspector>` in App.tsx — confirm it's not rendered anywhere.

---

#### TASK 1.4: Add file input validation on server (1.5 hours)

**File**: `server.ts`

**Current code (lines 68-116)**:
```typescript
app.post("/api/analyze", async (req, res) => {
    try {
      const { imageBase64, mimeType, deepScan } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
      }
```

**Replace with**:
```typescript
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BASE64_LENGTH = 20 * 1024 * 1024; // 20MB (base64 is ~33% larger)

app.post("/api/analyze", async (req, res) => {
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

      // Validate base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(imageBase64)) {
        return res.status(400).json({ error: "Invalid base64 encoding" });
      }

      const resolvedMimeType = mimeType || "image/jpeg";
      if (!ALLOWED_MIME_TYPES.includes(resolvedMimeType)) {
        return res.status(400).json({ error: `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` });
      }
```

**Also add client-side validation in** `src/App.tsx`, in `handleImageUpload`:

After `if (!files) return;` add:
```typescript
const file = files[0];
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
if (!ALLOWED_TYPES.includes(file.type)) {
  setError("Unsupported file type. Use JPEG, PNG, or WebP.");
  return;
}
const MAX_SIZE = 15 * 1024 * 1024; // 15MB
if (file.size > MAX_SIZE) {
  setError("File too large. Maximum 15MB.");
  return;
}
```

---

#### TASK 1.5: Install express-rate-limit (30 min)

**Terminal**:
```bash
npm install express-rate-limit
npm install -D @types/express-rate-limit
```

**File**: `server.ts`

**After `const app = express();` (line 23), add**:
```typescript
import rateLimit from 'express-rate-limit';

const analysisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many requests. Please wait before analyzing more images." },
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Change the route** (line 68):
```typescript
app.post("/api/analyze", analysisLimiter, async (req, res) => {
```

---

#### TASK 1.6: Fix clean script for Windows (5 min)

**File**: `package.json`

**Change line 10**:
```
"clean": "rm -rf dist server.js",
→ "clean": "npx rimraf dist server.js",
```

---

#### TASK 1.7: Install missing type packages (5 min)

**Terminal**:
```bash
npm install -D @types/react @types/react-dom
```

---

### DAY 1 CHECKPOINT

**Test checklist**:
```
1. npm run dev          → starts without error
2. curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d '{}'
                        → returns 400 "No image provided"
3. Upload a 20MB+ file   → returns error, doesn't crash
4. Upload a .txt file    → returns "Unsupported file type"
5. Rapid-click analyze 5x → starts rate-limiting
6. npm run clean         → works on Windows
```

---

### DAY 2 — Error Handling & User Feedback (3 hours)

---

#### TASK 2.1: Handle Gemini JSON parse failures (1 hour)

**File**: `server.ts`

**Around line 165, replace**:
```typescript
const analysis = JSON.parse(response.text || "{}");
res.json(analysis);
```

**With**:
```typescript
let analysis;
try {
  analysis = JSON.parse(response.text || "{}");
  if (!analysis.classification) {
    throw new Error("Missing classification in response");
  }
} catch (parseError) {
  console.error("Gemini JSON parse failed:", response.text?.substring(0, 200));
  return res.status(502).json({
    error: "Analysis engine returned malformed response",
    fallback: true,
    rawPreview: response.text?.substring(0, 500)
  });
}
res.json(analysis);
```

---

#### TASK 2.2: Handle Gemini timeout/rate-limit (1 hour)

**File**: `server.ts`

**Wrap the Gemini call (lines 122-163)** in a try-catch with retry:

```typescript
const MAX_RETRIES = 1;
let lastError: any;

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
        responseSchema: { ... }
      }
    });

    const analysis = JSON.parse(response.text || "{}");
    return res.json(analysis);

  } catch (err: any) {
    lastError = err;
    if (err.status === 429 || err.status === 503) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
    }
    break;
  }
}

console.error("Analysis Error after retries:", lastError);
res.status(500).json({ error: `Analysis failed: ${lastError.message || "Unknown error"}` });
```

**Also add a 30s timeout** — wrap the fetch in:
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

// ... inside ai.models.generateContent, if library supports AbortSignal
// If not, set timeout at Express level:
app.use('/api/analyze', (req, res, next) => {
  req.setTimeout(35000);
  next();
});
```

---

#### TASK 2.3: Client-side error display (30 min)

**File**: `src/App.tsx`

**Find the error display section**. Currently might not exist. Add before the result section:

```typescript
{error && (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3"
  >
    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-sm font-bold text-red-500 uppercase tracking-wider">Analysis Error</p>
      <p className="text-xs opacity-80 mt-1">{error}</p>
    </div>
    <button
      onClick={() => setError(null)}
      className="text-red-400 hover:text-red-300 text-xs"
    >
      Dismiss
    </button>
  </motion.div>
)}
```

**Place this** between the image display and the analyze button.

---

#### TASK 2.4: Loading states (30 min)

**File**: `src/App.tsx`

**Replace the current analyze button with**:
```typescript
<button
  onClick={runAnalysis}
  disabled={isAnalyzing}
  className={`w-full py-4 font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 transition-all ${
    isAnalyzing
      ? 'bg-[#141414] text-white/50 cursor-not-allowed'
      : 'bg-[#F27D26] text-black hover:bg-[#ff9447] active:scale-95 shadow-lg shadow-[#F27D26]/20'
  }`}
>
  {isAnalyzing ? (
    <>
      <RefreshCw className="w-5 h-5 animate-spin" />
      Analyzing... {elapsedSeconds}s
    </>
  ) : (
    <>
      <Search className="w-5 h-5" />
      Initialize Forensic Analysis
    </>
  )}
</button>
```

**Add state**:
```typescript
const [elapsedSeconds, setElapsedSeconds] = useState(0);
```

**Add timer effect**:
```typescript
useEffect(() => {
  let interval: NodeJS.Timeout;
  if (isAnalyzing) {
    setElapsedSeconds(0);
    interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
  }
  return () => clearInterval(interval);
}, [isAnalyzing]);
```

---

### DAY 2 CHECKPOINT

**Test checklist**:
```
1. Upload image, cut internet → see "Analysis Error" with retry option
2. Upload image normally → see spinner with elapsed seconds
3. Rapid analyze → button disabled during analysis
4. Dismiss error → error disappears
5. Check console on server — no unhandled errors
```

---

### DAY 3 — Improved Analysis Prompt (4 hours)

---

#### TASK 3.1: Add few-shot examples to prompt (2 hours)

**File**: `server.ts`

**Current** (lines 76-116): The prompt string.

**Replace the entire prompt construction** with an improved version:

```typescript
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
```

---

#### TASK 3.2: Add confidence guardrails (1 hour)

**File**: `server.ts`, after JSON.parse:

```typescript
// Post-processing: enforce uncertainty for low confidence
if (analysis.confidenceLevel === "Low" || 
    (analysis.aiLikelihood < 60 && analysis.realLikelihood < 60)) {
  analysis.classification = "Mixed/Uncertain";
  analysis.finalVerdict = "Insufficient evidence to make a definitive classification. Further analysis recommended.";
}

// Ensure all likelihoods sum to ~100
const total = analysis.aiLikelihood + analysis.realLikelihood + analysis.editedLikelihood;
if (total > 0) {
  analysis.aiLikelihood = Math.round((analysis.aiLikelihood / total) * 100);
  analysis.realLikelihood = Math.round((analysis.realLikelihood / total) * 100);
  analysis.editedLikelihood = Math.round((analysis.editedLikelihood / total) * 100);
}
```

---

#### TASK 3.3: Test against real images (30 min)

**Create test files**:

Terminal:
```bash
mkdir -p test-images/real test-images/ai
```

**Instructions for user**: Download to these folders:
- `test-images/real/` — 5 photos taken with phone/camera
- `test-images/ai/` — 5 images from Midjourney/DALL-E/Stable Diffusion

**Create test script**:

**File**: `test-accuracy.js` (standalone Node script, NOT part of the app)

```javascript
// Run: node test-accuracy.js
// This sends images to the API and logs results

const fs = require('fs');
const path = require('path');
const http = require('http');

const TEST_DIR = './test-images';
const results = [];

function testImage(filePath, expected) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');
  
  return new Promise((resolve) => {
    const data = JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' });
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/analyze',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const result = JSON.parse(body);
        results.push({
          file: path.basename(filePath),
          expected,
          got: result.classification,
          confidence: result.confidenceLevel,
          aiScore: result.aiLikelihood,
          realScore: result.realLikelihood,
          correct: result.classification === expected
        });
        resolve();
      });
    });
    req.on('error', (e) => {
      results.push({ file: path.basename(filePath), error: e.message });
      resolve();
    });
    req.write(data);
    req.end();
  });
}

async function run() {
  // Test all real images
  const realFiles = fs.readdirSync(path.join(TEST_DIR, 'real')).filter(f => /\.(jpg|png|webp)$/i.test(f));
  for (const f of realFiles) {
    await testImage(path.join(TEST_DIR, 'real', f), 'Real');
  }
  
  // Test all AI images
  const aiFiles = fs.readdirSync(path.join(TEST_DIR, 'ai')).filter(f => /\.(jpg|png|webp)$/i.test(f));
  for (const f of aiFiles) {
    await testImage(path.join(TEST_DIR, 'ai', f), 'AI-generated');
  }
  
  // Print report
  console.log('\n=== ACCURACY TEST RESULTS ===\n');
  results.forEach(r => {
    const mark = r.correct ? '✅' : '❌';
    console.log(`${mark} ${r.file}: expected=${r.expected} got=${r.got} (AI:${r.aiScore}% Real:${r.realScore}%)`);
  });
  
  const correct = results.filter(r => r.correct).length;
  console.log(`\nAccuracy: ${correct}/${results.length} (${Math.round(correct/results.length*100)}%)`);
}

run().catch(console.error);
```

---

### DAY 3 CHECKPOINT

```
1. Run test-accuracy.js → see accuracy report
2. If < 70% accuracy, tweak prompt and re-run
3. Document current accuracy in docs/baseline.md
```

---

### DAY 4-5 — EXIF Extraction (6 hours)

---

#### TASK 4.1: Deep exifr integration (2 hours)

**File**: `server.ts`

**Add new endpoint or extend analyze endpoint**:

Add a new route or extend the existing response. For cleanliness, add a new route:

```typescript
import exifr from 'exifr';

app.post("/api/metadata", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const buffer = Buffer.from(imageBase64, 'base64');

    const metadata = await exifr.parse(buffer, {
      full: true,              // Parse all segments
      multiSegment: true,      // Parse multi-segment EXIF
      icc: true,               // ICC color profile
      xmp: true,               // XMP metadata
      tiff: true,              // Full TIFF/EXIF
      jfif: true,              // JFIF (JPEG header)
      ihdr: true,              // PNG header
    });

    // Also get file hash
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Detect AI tool signatures
    const AI_SOFTWARE_SIGNATURES = [
      'midjourney', 'stable diffusion', 'dall-e', 'dalle', 'firefly',
      'novelai', 'artbreeder', 'gan', 'generative', 'comfyui',
      'automatic1111', 'fooocus', 'leonardo', 'dreamstudio'
    ];

    const softwareTraces = [];
    // Check EXIF Software field
    if (metadata?.Software) {
      const sw = metadata.Software.toLowerCase();
      if (AI_SOFTWARE_SIGNATURES.some(sig => sw.includes(sig))) {
        softwareTraces.push({ field: 'Software', value: metadata.Software, aiRelated: true });
      }
    }
    // Check XMP
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
```

**Also add at top of file**:
```typescript
import exifr from 'exifr';
```

---

#### TASK 4.2: Send metadata request from client (1 hour)

**File**: `src/App.tsx`

**In `handleImageUpload`**, after extracting EXIF with exifr on client, also call the server endpoint:

```typescript
// After the existing EXIF extraction
try {
  const base64Data = base64.split(',')[1];
  const metaResponse = await fetch('/api/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64Data }),
  });
  if (metaResponse.ok) {
    const metaData = await metaResponse.json();
    setExifData(metaData);
  }
} catch (err) {
  // Non-critical, don't block upload
  console.warn("Server-side metadata extraction failed", err);
}
```

**Also add state**:
```typescript
const [exifData, setExifData] = useState<any>(null); // already exists, but ensure it handles new format
```

---

#### TASK 4.3: Metadata display in UI (1 hour)

**File**: `src/App.tsx` or new component `src/components/MetadataPanel.tsx`

**Create new component**:
```typescript
// src/components/MetadataPanel.tsx
import React from 'react';
import { Camera, MapPin, Cpu, Hash, FileImage } from 'lucide-react';

export default function MetadataPanel({ data }: { data: any }) {
  if (!data) return null;

  const sections = [];

  if (data.exif) {
    const cameraItems = [
      { label: 'Camera', value: data.exif.Model || data.exif.Make || 'Unknown' },
      { label: 'Lens', value: data.exif.LensModel || 'Unknown' },
      { label: 'Focal Length', value: data.exif.FocalLength ? `${data.exif.FocalLength}mm` : 'Unknown' },
      { label: 'Aperture', value: data.exif.FNumber ? `f/${data.exif.FNumber}` : 'Unknown' },
      { label: 'ISO', value: data.exif.ISO || 'Unknown' },
      { label: 'Shutter', value: data.exif.ExposureTime ? `${data.exif.ExposureTime}s` : 'Unknown' },
      { label: 'Date Taken', value: data.exif.DateTimeOriginal ? new Date(data.exif.DateTimeOriginal).toLocaleString() : 'Unknown' },
    ];
    sections.push({ title: 'Camera', icon: Camera, items: cameraItems });
  }

  if (data.gps) {
    sections.push({
      title: 'GPS Location',
      icon: MapPin,
      items: [
        { label: 'Latitude', value: data.gps.lat.toFixed(6) },
        { label: 'Longitude', value: data.gps.lng.toFixed(6) },
      ]
    });
  }

  if (data.dimensions) {
    sections.push({
      title: 'File',
      icon: FileImage,
      items: [
        { label: 'Dimensions', value: `${data.dimensions.width}×${data.dimensions.height}` },
        { label: 'SHA-256', value: data.hash?.substring(0, 16) + '...' },
      ]
    });
  }

  if (data.softwareTraces?.length) {
    sections.push({
      title: 'Software Traces',
      icon: Cpu,
      items: data.softwareTraces.map((t: any) => ({
        label: t.field,
        value: t.value + (t.aiRelated ? ' ⚠️' : ''),
      }))
    });
  }

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <div key={i} className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A]">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest mb-3">
            <section.icon className="w-4 h-4" />
            {section.title}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {section.items.map((item, j) => (
              <div key={j}>
                <p className="text-[9px] opacity-40 uppercase">{item.label}</p>
                <p className="text-xs font-mono">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**In App.tsx**, import and render:
```typescript
import MetadataPanel from './components/MetadataPanel';

// In the result section, add:
{exifData && <MetadataPanel data={exifData} />}
```

---

#### TASK 4.4: Handle stripped/missing EXIF (30 min)

**In `MetadataPanel.tsx`**, add at top:
```typescript
if (!data?.exif && !data?.hash) {
  return (
    <div className="p-4 border border-[#F27D26]/20 rounded-xl bg-[#0A0A0A]">
      <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest mb-2">
        <Camera className="w-4 h-4" />
        Metadata Analysis
      </div>
      <p className="text-xs opacity-60">
        No metadata found. This could indicate:
      </p>
      <ul className="text-[10px] opacity-40 mt-2 space-y-1 list-disc list-inside">
        <li>Image was generated by AI (AI tools often strip/omit EXIF)</li>
        <li>Metadata was intentionally removed</li>
        <li>Image format doesn't support EXIF</li>
      </ul>
      {data?.hash && (
        <p className="text-[10px] font-mono mt-2 opacity-30">
          SHA-256: {data.hash.substring(0, 16)}...
        </p>
      )}
    </div>
  );
}
```

---

#### TASK 4.5: SHA-256 hash generation — already done in TASK 4.1

The `/api/metadata` endpoint already returns `hash`. Display it as shown above.

---

### DAY 4-5 CHECKPOINT

```
1. Upload a phone photo → see camera model, aperture, ISO, GPS
2. Upload a phone photo with GPS → see lat/lng displayed
3. Upload an AI image without EXIF → see "No metadata found" with explanations
4. Upload an AI image with "Midjourney" in Software field → see "Software Traces" section
5. SHA-256 shown on all results
```

---

### DAY 6-7 — PDF Report (6 hours)

---

#### TASK 6.1: Design report layout (30 min)

**Create file**: `src/utils/reportTemplates.ts`

```typescript
// Report layout constants
export const REPORT_STYLES = {
  primaryColor: [242, 125, 38] as [number, number, number], // #F27D26
  darkBg: [5, 5, 5] as [number, number, number],
  lightBg: [20, 20, 20] as [number, number, number],
  textColor: [228, 227, 224] as [number, number, number],
  greenColor: [34, 197, 94] as [number, number, number],
  redColor: [239, 68, 68] as [number, number, number],
  yellowColor: [234, 179, 8] as [number, number, number],
  pageWidth: 210, // A4 in mm
  pageHeight: 297,
  margin: 15,
  headerHeight: 40,
};

export function generateCaseId(): string {
  return `FG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}
```

---

#### TASK 6.2: Implement PDF structure (2 hours)

**Rewrite `generatePDF` function in App.tsx** (or extract to `src/utils/pdfGenerator.ts`):

```typescript
// src/utils/pdfGenerator.ts
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { REPORT_STYLES, generateCaseId } from './reportTemplates';

export interface PDFData {
  classification: string;
  aiLikelihood: number;
  realLikelihood: number;
  editedLikelihood: number;
  consistencyScore: number;
  confidenceLevel: string;
  keyEvidence: string[];
  detectedIssues: string[];
  forensicSummary: string;
  finalVerdict: string;
  mostLikelySource: string;
  filename?: string;
  hash?: string;
  exifData?: any;
}

export function generateForensicReport(data: PDFData, imageBase64?: string): jsPDF {
  const doc = new jsPDF();
  const caseId = generateCaseId();
  const date = new Date().toLocaleString('en-US', { 
    dateStyle: 'long', timeStyle: 'short' 
  });

  // ===== PAGE 1: HEADER =====
  doc.setFillColor(...REPORT_STYLES.darkBg);
  doc.rect(0, 0, REPORT_STYLES.pageWidth, REPORT_STYLES.headerHeight, 'F');

  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('FORENSICTRACE', REPORT_STYLES.margin, 22);

  doc.setTextColor(...REPORT_STYLES.textColor);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Digital Image Forensics & Analysis Report', REPORT_STYLES.margin, 30);
  doc.text(`Case: ${caseId}`, REPORT_STYLES.margin, 35);

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${date}`, REPORT_STYLES.pageWidth - REPORT_STYLES.margin, 35, { align: 'right' });

  // ===== PAGE 1: IMAGE (if available) =====
  let yPos = REPORT_STYLES.headerHeight + 10;
  if (imageBase64) {
    try {
      doc.addImage(imageBase64, 'JPEG', REPORT_STYLES.margin, yPos, 80, 60);
      yPos += 70;
    } catch (e) {
      yPos += 5;
    }
  }

  // ===== PAGE 1: VERDICT TABLE =====
  const verdictBg = 
    data.classification === 'AI-generated' ? REPORT_STYLES.redColor :
    data.classification === 'Real' ? REPORT_STYLES.greenColor :
    REPORT_STYLES.yellowColor;

  autoTable(doc, {
    startY: yPos,
    body: [
      [
        {
          content: `CLASSIFICATION: ${data.classification.toUpperCase()}`,
          styles: { 
            fillType: 'solid',
            fillColor: verdictBg,
            textColor: [255, 255, 255],
            fontSize: 14,
            fontStyle: 'bold',
            halign: 'center',
          },
          colSpan: 2,
        }
      ],
      [
        { content: 'Confidence Level', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: data.confidenceLevel.toUpperCase(), styles: { fontSize: 8 } },
      ],
      [
        { content: 'AI Likelihood', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.aiLikelihood}%`, styles: { fontSize: 8 } },
      ],
      [
        { content: 'Real Likelihood', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.realLikelihood}%`, styles: { fontSize: 8 } },
      ],
      [
        { content: 'Edited Likelihood', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.editedLikelihood}%`, styles: { fontSize: 8 } },
      ],
      [
        { content: 'Consistency Score', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.consistencyScore}%`, styles: { fontSize: 8 } },
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: REPORT_STYLES.lightBg },
    margin: { left: REPORT_STYLES.margin, right: REPORT_STYLES.margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // ===== PAGE 1: SOURCE =====
  if (data.mostLikelySource) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_STYLES.textColor);
    doc.text('Likely Source:', REPORT_STYLES.margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(data.mostLikelySource, REPORT_STYLES.margin + 35, yPos);
    yPos += 10;
  }

  // ===== PAGE 1: FORENSIC SUMMARY =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Forensic Summary', REPORT_STYLES.margin, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const summaryLines = doc.splitTextToSize(data.forensicSummary, REPORT_STYLES.pageWidth - 2 * REPORT_STYLES.margin);
  doc.text(summaryLines, REPORT_STYLES.margin, yPos);
  yPos += summaryLines.length * 5 + 10;

  // ===== PAGE 2 (if needed): EVIDENCE / ISSUES =====
  if (yPos > REPORT_STYLES.pageHeight - 60 || data.keyEvidence.length > 0) {
    doc.addPage();
    yPos = REPORT_STYLES.margin;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_STYLES.primaryColor);
    doc.text('Supporting Evidence & Detected Issues', REPORT_STYLES.margin, yPos);
    yPos += 10;

    doc.setTextColor(...REPORT_STYLES.textColor);
    data.keyEvidence.forEach((ev, i) => {
      doc.setFontSize(8);
      doc.setTextColor(...REPORT_STYLES.greenColor);
      doc.text('✓', REPORT_STYLES.margin, yPos);
      doc.setTextColor(...REPORT_STYLES.textColor);
      doc.text(ev, REPORT_STYLES.margin + 5, yPos);
      yPos += 5;
    });

    yPos += 5;
    data.detectedIssues.forEach((issue, i) => {
      doc.setFontSize(8);
      doc.setTextColor(...REPORT_STYLES.redColor);
      doc.text('!', REPORT_STYLES.margin, yPos);
      doc.setTextColor(...REPORT_STYLES.textColor);
      doc.text(issue, REPORT_STYLES.margin + 5, yPos);
      yPos += 5;
    });

    yPos += 10;

    // ===== PAGE 2: FINAL VERDICT =====
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_STYLES.primaryColor);
    doc.text('Final Verdict', REPORT_STYLES.margin, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...REPORT_STYLES.textColor);
    const verdictLines = doc.splitTextToSize(data.finalVerdict, REPORT_STYLES.pageWidth - 2 * REPORT_STYLES.margin);
    doc.text(verdictLines, REPORT_STYLES.margin, yPos);
  }

  // ===== LAST PAGE: INTEGRITY SECTION =====
  doc.addPage();
  yPos = REPORT_STYLES.margin;

  doc.setFillColor(...REPORT_STYLES.darkBg);
  doc.rect(0, 0, REPORT_STYLES.pageWidth, 20, 'F');
  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATION & INTEGRITY', REPORT_STYLES.margin, 14);
  yPos = 30;

  const integrityData = [
    ['Case ID', caseId],
    ['Analysis Date', date],
    ['File Hash (SHA-256)', data.hash || 'Not available'],
    ['Classification', data.classification],
    ['Confidence', data.confidenceLevel],
    ['System', 'ForensicTrace v2.4.0 / Gemini 2.0 Flash'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Field', 'Value']],
    body: integrityData,
    theme: 'striped',
    headStyles: { fillColor: REPORT_STYLES.lightBg, textColor: REPORT_STYLES.primaryColor },
    margin: { left: REPORT_STYLES.margin, right: REPORT_STYLES.margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Disclaimer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'italic');
  const disclaimer = 'This report is generated for research and investigative purposes only. '
    + 'It should not be used as sole evidence in legal proceedings without independent verification. '
    + 'The accuracy of AI-generated content detection is probabilistic and not guaranteed.';
  const discLines = doc.splitTextToSize(disclaimer, REPORT_STYLES.pageWidth - 2 * REPORT_STYLES.margin);
  doc.text(discLines, REPORT_STYLES.margin, yPos);

  return doc;
}
```

**In App.tsx**, simplify `generatePDF` to:
```typescript
import { generateForensicReport } from './utils/pdfGenerator';

const handleGeneratePDF = (item?: BatchResult) => {
  const data = item || result;
  const img = item ? item.thumbnail : selectedImage;
  if (!data || !img) return;

  const doc = generateForensicReport({
    classification: data.classification,
    aiLikelihood: data.aiLikelihood,
    realLikelihood: data.realLikelihood,
    editedLikelihood: data.editedLikelihood,
    consistencyScore: data.consistencyScore,
    confidenceLevel: data.confidenceLevel,
    keyEvidence: data.keyEvidence,
    detectedIssues: data.detectedIssues,
    forensicSummary: data.forensicSummary,
    finalVerdict: data.finalVerdict,
    mostLikelySource: data.mostLikelySource,
    filename: (data as any).filename || 'evidence',
    hash: exifData?.hash,
    exifData: exifData,
  }, img);

  const caseId = `ForensicTrace_Report_${Date.now()}`;
  doc.save(`${caseId}.pdf`);
};
```

---

#### TASK 6.3: Download button (existing, verify works)

**App.tsx**: The "Generate Court Report" button (`line 497`) should call `handleGeneratePDF`.

**Change `handleGeneratePDF` reference** in the button from `generatePDF` to `handleGeneratePDF`.

---

### DAY 6-7 CHECKPOINT

```
1. Analyze an image → click "Generate PDF" → PDF downloads
2. PDF opens with: header, case ID, verdict, evidence, metadata, hash
3. PDF has disclaimer on last page
4. Multi-page PDF when there's lots of evidence
```

---

## TIER 0 COMPLETE

**At this point you have**:
- Secure app that validates inputs
- Reliable Gemini analysis with retry logic
- EXIF extraction with AI-tool signature detection
- SHA-256 integrity hashing
- Professional multi-page PDF report
- Test suite and baseline accuracy documented

**Do not proceed to Tier 1 unless Tier 0 is working 100%.**

---

## TIER 1 — SINGLE ANALYSIS POLISH (Week 3-4, ~22 hours)

---

### DAY 8 — Deep Scan Toggle Fix (2 hours)

---

#### TASK 8.1: Split deepScan into separate states

**File**: `src/App.tsx`

**Change**:
```typescript
const [deepScan, setDeepScan] = useState(false);
```
**To**:
```typescript
const [singleDeepScan, setSingleDeepScan] = useState(false);
const [batchDeepScan, setBatchDeepScan] = useState(false);
```

**Update all references**:
- Single view checkbox: `checked={singleDeepScan}` `onChange={(e) => setSingleDeepScan(e.target.checked)}`
- Batch view checkbox: `checked={batchDeepScan}` `onChange={(e) => setBatchDeepScan(e.target.checked)}`
- Single analysis call: `deepScan: singleDeepScan`
- Batch analysis call: `deepScan: batchDeepScan`

---

#### TASK 8.2: Improve deep scan prompt (1 hour)

**File**: `server.ts`

**Replace the current deep scan append** (line 119):
```typescript
if (deepScan) {
  prompt += `\n\n[DENSE-SCAN ENABLED] Perform the highest-precision forensic analysis...`;
}
```

**With a completely separate prompt path**:
```typescript
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

Provide the same JSON structure as standard analysis.`;
}
```

---

### DAY 8 CHECKPOINT

```
1. Toggle deep scan in single view → batch view checkbox unchanged
2. Deep scan enabled → analysis takes longer, shows "DEEP SCAN" badge
3. Compare results with/without deep scan on same image
```

---

### DAY 9-10 — Result Display Improvements (5 hours)

---

#### TASK 9.1: Better verdict card design (2 hours)

**In App.tsx**, refactor the result display section (`lines 510-545`).

**Extract to component**: `src/components/VerdictCard.tsx`

```typescript
// src/components/VerdictCard.tsx
import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';

interface VerdictCardProps {
  classification: string;
  aiLikelihood: number;
  realLikelihood: number;
  editedLikelihood: number;
  consistencyScore: number;
  confidenceLevel: string;
}

export default function VerdictCard({ classification, aiLikelihood, realLikelihood, editedLikelihood, consistencyScore, confidenceLevel }: VerdictCardProps) {
  const isAI = classification === 'AI-generated';
  const isReal = classification === 'Real';
  const isUncertain = classification === 'Mixed/Uncertain';

  const borderColor = isAI ? 'border-orange-500/30' : isReal ? 'border-green-500/30' : 'border-yellow-500/30';
  const bgColor = isAI ? 'bg-orange-500/5' : isReal ? 'bg-green-500/5' : 'bg-yellow-500/5';
  const textColor = isAI ? 'text-orange-500' : isReal ? 'text-green-500' : 'text-yellow-500';

  const Icon = isAI ? ShieldAlert : isReal ? ShieldCheck : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-6 rounded-2xl border ${borderColor} ${bgColor} relative overflow-hidden`}
    >
      {/* Background glow */}
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-5 ${textColor}`}
        style={{ background: `radial-gradient(circle, currentColor 0%, transparent 70%)` }}
      />

      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-[10px] uppercase font-mono opacity-50 tracking-widest mb-1">Final Classification</p>
          <div className="flex items-center gap-3">
            <Icon className={`w-8 h-8 ${textColor}`} />
            <h3 className={`text-3xl font-black uppercase italic tracking-tighter ${textColor}`}>
              {classification}
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-mono opacity-50 tracking-widest mb-1">Confidence</p>
          <span className={`text-2xl font-mono font-bold ${textColor}`}>{confidenceLevel}</span>
        </div>
      </div>

      {/* Score bars */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <ScoreBar label="AI" value={aiLikelihood} color="text-orange-500" barColor="bg-orange-500" />
        <ScoreBar label="Real" value={realLikelihood} color="text-green-500" barColor="bg-green-500" />
        <ScoreBar label="Edited" value={editedLikelihood} color="text-yellow-500" barColor="bg-yellow-500" />
      </div>

      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="flex justify-between text-xs opacity-50">
          <span>Consistency Score</span>
          <span className="font-mono font-bold">{consistencyScore}%</span>
        </div>
        <div className="mt-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-1000"
            style={{ width: `${consistencyScore}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function ScoreBar({ label, value, color, barColor }: { label: string; value: number; color: string; barColor: string }) {
  return (
    <div className="text-center">
      <p className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</p>
      <p className={`text-2xl font-mono font-bold mt-1 ${color}`}>{value}%</p>
      <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-1000`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
```

**In App.tsx**, replace the old result block with:
```typescript
<VerdictCard
  classification={result.classification}
  aiLikelihood={result.aiLikelihood}
  realLikelihood={result.realLikelihood}
  editedLikelihood={result.editedLikelihood}
  consistencyScore={result.consistencyScore}
  confidenceLevel={result.confidenceLevel}
/>
```

---

#### TASK 9.2: Evidence/issue list component (1.5 hours)

**Create**: `src/components/EvidenceList.tsx`

```typescript
// src/components/EvidenceList.tsx
import React, { useState } from 'react';
import { FileSearch, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EvidenceListProps {
  keyEvidence: string[];
  detectedIssues: string[];
  forensicSummary: string;
}

export default function EvidenceList({ keyEvidence, detectedIssues, forensicSummary }: EvidenceListProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[#141414] rounded-xl bg-[#0A0A0A] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest">
          <FileSearch className="w-4 h-4" />
          Forensic Evidence ({keyEvidence.length + detectedIssues.length} items)
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 space-y-3"
          >
            {keyEvidence.length > 0 && (
              <div>
                <p className="text-[9px] uppercase font-mono text-green-500 mb-2 flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" /> Supporting Evidence
                </p>
                <ul className="space-y-1.5">
                  {keyEvidence.map((ev, i) => (
                    <li key={i} className="text-xs flex gap-2 opacity-80">
                      <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detectedIssues.length > 0 && (
              <div>
                <p className="text-[9px] uppercase font-mono text-red-500 mb-2 flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" /> Detected Issues
                </p>
                <ul className="space-y-1.5">
                  {detectedIssues.map((issue, i) => (
                    <li key={i} className="text-xs flex gap-2 opacity-80">
                      <span className="text-red-500 flex-shrink-0 mt-0.5">!</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-3 border-t border-white/5">
              <p className="text-[9px] uppercase font-mono text-[#F27D26] mb-1">Forensic Summary</p>
              <p className="text-xs opacity-70 leading-relaxed">{forensicSummary}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**In App.tsx**, replace the old evidence section:
```typescript
<EvidenceList
  keyEvidence={result.keyEvidence}
  detectedIssues={result.detectedIssues}
  forensicSummary={result.forensicSummary}
/>
```

---

#### TASK 9.3: Responsive layout fixes (1 hour)

**In App.tsx**, the grid layout (`line 448`):
```html
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
```

Current is already somewhat responsive. Add mobile-specific:
- Below md: stack vertically (already works with `grid-cols-1`)
- Buttons: `flex-col md:flex-row` for action buttons
- Tables: `overflow-x-auto` for batch view (already present)

---

### DAY 9-10 CHECKPOINT

```
1. Result shows: verdict card with colored score bars
2. Click evidence section → expands/collapses with animation
3. Evidence items green, issue items red
4. Forensic summary shown at bottom
5. Mobile view stacks everything vertically
```

---

### DAY 11 — Enhanced Report (3.5 hours)

---

#### TASK 11.1: Multi-page PDF — already done in TASK 6.2

The `generateForensicReport` function already creates multi-page PDFs.

---

#### TASK 11.2: Add chain-of-custody section

**In `generateForensicReport`**, add this to the integrity page:

```typescript
// Chain of custody log
const custodyLog = [
  ['Action', 'Timestamp', 'System'],
  ['File Ingested', date, 'ForensicTrace v2.4.0'],
  ['Metadata Extracted', date, 'ForensicTrace v2.4.0'],
  ['AI Analysis (Gemini)', date, 'Gemini 2.0 Flash'],
  ['Report Generated', date, 'ForensicTrace v2.4.0'],
];

autoTable(doc, {
  startY: yPos,
  head: [['Action', 'Timestamp', 'System']],
  body: custodyLog.slice(1),
  theme: 'striped',
  headStyles: { fillColor: REPORT_STYLES.lightBg, textColor: REPORT_STYLES.primaryColor },
  margin: { left: REPORT_STYLES.margin, right: REPORT_STYLES.margin },
});
```

---

#### TASK 11.3: Watermark every page

**In `generateForensicReport`**, after creating `doc`:
```typescript
// Add watermark to every page
const addWatermark = () => {
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(`FORENSICTRACE — ${caseId}`, REPORT_STYLES.pageWidth - REPORT_STYLES.margin, REPORT_STYLES.pageHeight - 10, { align: 'right' });
    doc.text(`Page ${i}`, REPORT_STYLES.margin, REPORT_STYLES.pageHeight - 10);
  }
};

// Call before save
addWatermark();
```

---

#### TASK 11.4: Disclaimer footer — already done in TASK 6.2

---

### DAY 11 CHECKPOINT

```
1. PDF has chain-of-custody table
2. Every page has "FORENSICTRACE — FG-XXXXX" watermark
3. Disclaimer present on last page
```

---

### DAY 12 — Testing & Validation (5.5 hours)

---

#### TASK 12.1: Build test set (2 hours)

**Create folder structure**:
```
test-images/
├── real/
│   ├── phone_photo_1.jpg
│   ├── phone_photo_2.jpg
│   ├── dslr_photo_1.jpg
│   ├── stock_photo_1.jpg
│   └── scanned_doc_1.jpg
├── ai/
│   ├── midjourney_1.jpg
│   ├── midjourney_2.jpg
│   ├── dalle_1.jpg
│   ├── stable_diffusion_1.jpg
│   └── firefly_1.jpg
├── edited/
│   ├── photoshop_edit_1.jpg
│   ├── spliced_1.jpg
│   └── filtered_1.jpg
└── results/
```

**Source images**:
- Real: Take 5 photos with your phone, download 5 from unsplash.com
- AI: Download from lexica.art, playgroundai.com, or use free tier of Midjourney/DALL-E
- Edited: Take a real photo and edit it in any free tool

---

#### TASK 12.2: Run baseline accuracy (1.5 hours)

**Run**:
```bash
node test-accuracy.js
```

**Log results** to `test-images/results/baseline_YYYY-MM-DD.json`.

---

#### TASK 12.3: Fix obvious failures (2 hours)

For each wrong classification:
```
1. Upload the misclassified image manually
2. Read the analysis — what did Gemini say?
3. Is it an edge case? (dark photo, heavily compressed, unusual subject)
4. Add edge case handling to the prompt
5. Re-run the test
```

**Common fixes**:
- If all real photos are flagged as AI: tone down AI artifact detection in prompt
- If all AI photos are marked real: strengthen visual inconsistency checks
- If specific model (e.g., Midjourney) consistently fails: add model-specific artifact detection

---

#### TASK 12.4: Document accuracy

**Create file**: `docs/accuracy.md`

```markdown
# ForensicTrace Accuracy Baseline

Date: YYYY-MM-DD
Test images: 10 real, 10 AI, 3 edited

## Results

| Category | Correct | Total | Accuracy |
|----------|---------|-------|----------|
| Real | 9 | 10 | 90% |
| AI-generated | 8 | 10 | 80% |
| Edited | 2 | 3 | 67% |
| **Total** | **19** | **23** | **83%** |

## Known failure cases
- Overly dark images (low light): 2 false negatives
- Midjourney v6 artistic style: 1 false positive
- Images under 200px: unreliable

## Next improvement target
- Add ELA algorithm to catch edited images
- Increase test set to 50 images
```

---

## TIER 2 — BATCH PROCESSING (Week 5-6, ~22 hours)

---

### DAY 13-14 — Batch Upload & Queue (6 hours)

---

#### TASK 13.1: Fix batch upload identity bug (1 hour)

**In `handleMultipleUploads`** (`App.tsx` line 116):

**Current bug**: Uses `item.filename === file.name` for matching — breaks with duplicate filenames.

**Fix**: Use the `id` field for matching:

```typescript
const handleMultipleUploads = (files: File[]) => {
  const entries = files.map(file => ({
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
    filename: file.name,
    ...
  }));

  // Read thumbnails
  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const thumb = reader.result as string;
      setBatchResults(prev => prev.map(item =>
        item.id === entries[index].id ? { ...item, thumbnail: thumb } : item
      ));
    };
    reader.readAsDataURL(file);
  });

  setBatchResults(prev => [...entries, ...prev]);
};
```

---

#### TASK 13.2: Batch queue UI (2 hours)

**Create**: `src/components/BatchQueue.tsx`

Shows queued items before analysis starts. Replace the raw input section.

---

#### TASK 13.3: Sequential processing with progress (2 hours)

**In `runBatchAnalysis`** (`App.tsx` line 175):

**Current**: loops through items, processes one-by-one. Already sequential.

**Add**: Progress tracking:
```typescript
const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
```

Update progress before each item:
```typescript
setBatchProgress({ current: index + 1, total: pendingItems.length });
```

**Add progress bar** above batch table:
```typescript
{batchProgress.total > 0 && (
  <div className="p-4 bg-[#0A0A0A] border border-[#141414] rounded-xl">
    <div className="flex justify-between text-[10px] font-mono text-[#F27D26] mb-2">
      <span>Processing batch... {batchProgress.current}/{batchProgress.total}</span>
      <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
    </div>
    <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-[#F27D26]"
        initial={{ width: 0 }}
        animate={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
      />
    </div>
  </div>
)}
```

---

#### TASK 13.4: Error handling in batch (1 hour)

**In `runBatchAnalysis`**, wrap each item in try-catch (already done). Add:
- Failed items get `status: 'error'` with error detail stored
- Batch continues to next item on failure
- "Retry failed" button

```typescript
} catch (err) {
  setBatchResults(prev => prev.map(i =>
    i.id === item.id
      ? { ...i, status: 'error', errorDetail: err.message }
      : i
  ));
}
```

**Add retry button**:
```typescript
const retryFailed = () => {
  setBatchResults(prev => prev.map(i =>
    i.status === 'error' ? { ...i, status: 'pending' } : i
  ));
  runBatchAnalysis();
};
```

---

### DAY 13-14 CHECKPOINT

```
1. Upload 5 images → see them in a queue
2. Click "Process" → progress bar shows 1/5, 2/5, etc.
3. One image fails → others continue, failed shows error badge
4. Click "Retry" → only failed items reprocess
```

---

### DAY 15 — Batch Table & Sorting (5 hours)

---

#### TASK 15.1: Sortable results table (2 hours)

**Current**: `sortedAndFilteredBatch` already exists in `App.tsx` (`line 202`).

**Add column toggles** for: filename, classification, AI likelihood, consistency score, timestamp.

**The sorting logic already exists. Add visual indicator** for active sort column (already partially done).

---

#### TASK 15.2: Filter by classification (1 hour)

**Current**: filter dropdown exists at `line 570-579`.

**Ensure it works end-to-end**: selecting "AI-generated" only shows AI items.

---

#### TASK 15.3: Select row → view detail (1.5 hours)

**Current**: clicking a row thumbnail sets `selectedImage` and switches to single view (`line 658-662`).

**Add**: when clicking a completed row, show the full analysis in the single view. Ensure `result` is set from the batch item's data.

```typescript
onClick={() => {
  setSelectedImage(item.thumbnail);
  setResult(item.status === 'completed' ? {
    classification: item.classification,
    aiLikelihood: item.aiLikelihood,
    realLikelihood: item.realLikelihood,
    editedLikelihood: item.editedLikelihood,
    consistencyScore: item.consistencyScore,
    confidenceLevel: item.confidenceLevel,
    keyEvidence: item.keyEvidence,
    detectedIssues: item.detectedIssues,
    mostLikelySource: item.mostLikelySource,
    forensicSummary: item.forensicSummary,
    finalVerdict: item.finalVerdict,
  } : null);
  setViewMode('single');
}}
```

---

### DAY 15 CHECKPOINT

```
1. Batch table shows all uploaded images
2. Click "Filename" column → sorts A-Z, click again → Z-A
3. Filter dropdown → only shows matching classifications
4. Click a completed row → single view with full result
```

---

### DAY 16 — Batch Export (5 hours)

---

#### TASK 16.1: CSV export — already exists, improve columns

**File**: `src/App.tsx`, `exportBatchToCSV` (line 308)

**Replace with**:
```typescript
const exportBatchToCSV = () => {
  const csv = Papa.unparse(batchResults.map(r => ({
    Filename: r.filename,
    Classification: r.classification,
    Confidence: r.confidenceLevel,
    AI_Likelihood: `${r.aiLikelihood}%`,
    Real_Likelihood: `${r.realLikelihood}%`,
    Edited_Likelihood: `${r.editedLikelihood}%`,
    Consistency_Score: `${r.consistencyScore}%`,
    Source: r.mostLikelySource,
    Timestamp: new Date(r.timestamp).toLocaleString(),
    Status: r.status,
  })));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `ForensicTrace_Batch_${Date.now()}.csv`);
};
```

---

#### TASK 16.2: Batch PDF export (2 hours)

```typescript
const exportBatchPDF = () => {
  const doc = new jsPDF();
  const caseId = generateCaseId();

  // Title page
  doc.setFillColor(...REPORT_STYLES.darkBg);
  doc.rect(0, 0, 210, 50, 'F');
  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.setFontSize(24);
  doc.text('FORENSICTRACE', 15, 25);
  doc.setFontSize(10);
  doc.setTextColor(...REPORT_STYLES.textColor);
  doc.text(`Batch Analysis Report — ${batchResults.length} images`, 15, 35);
  doc.text(`Case: ${caseId}`, 15, 42);

  // Summary stats
  const aiCount = batchResults.filter(r => r.classification === 'AI-generated').length;
  const realCount = batchResults.filter(r => r.classification === 'Real').length;
  const uncertainCount = batchResults.filter(r => r.classification === 'Mixed/Uncertain').length;

  autoTable(doc, {
    startY: 60,
    body: [
      ['AI-Generated', `${aiCount} (${Math.round(aiCount/batchResults.length*100)}%)`],
      ['Real', `${realCount} (${Math.round(realCount/batchResults.length*100)}%)`],
      ['Uncertain', `${uncertainCount} (${Math.round(uncertainCount/batchResults.length*100)}%)`],
      ['Total', `${batchResults.length}`],
    ],
    theme: 'grid',
  });

  // Detail table
  doc.addPage();
  const tableData = batchResults.map(r => [
    r.filename,
    r.classification,
    `${r.aiLikelihood}%`,
    r.confidenceLevel,
    r.status,
  ]);

  autoTable(doc, {
    startY: 15,
    head: [['Filename', 'Classification', 'AI%', 'Confidence', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: REPORT_STYLES.lightBg, textColor: REPORT_STYLES.primaryColor },
  });

  doc.save(`ForensicTrace_Batch_${caseId}.pdf`);
};
```

---

#### TASK 16.3: ZIP archive export (1.5 hours)

```typescript
const exportBatchArchive = async () => {
  const zip = new JSZip();

  // Add CSV
  const csv = Papa.unparse(batchResults.map(r => ({...})));
  zip.file('batch_results.csv', csv);

  // Add individual images + metadata
  for (const item of batchResults) {
    if (item.thumbnail) {
      const base64 = item.thumbnail.split(',')[1];
      zip.file(`evidence/${item.filename}`, base64, { base64: true });
      zip.file(`reports/${item.filename}.json`, JSON.stringify({
        classification: item.classification,
        aiLikelihood: item.aiLikelihood,
        evidence: item.keyEvidence,
        issues: item.detectedIssues,
      }, null, 2));
    }
  }

  // Add summary JSON
  zip.file('case_summary.json', JSON.stringify({
    caseId: generateCaseId(),
    date: new Date().toISOString(),
    totalImages: batchResults.length,
    summary: {
      aiGenerated: batchResults.filter(r => r.classification === 'AI-generated').length,
      real: batchResults.filter(r => r.classification === 'Real').length,
      edited: batchResults.filter(r => r.classification === 'Edited').length,
      uncertain: batchResults.filter(r => r.classification === 'Mixed/Uncertain').length,
    },
  }, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `ForensicTrace_Case_${Date.now()}.zip`);
};
```

---

### DAY 16 CHECKPOINT

```
1. Batch export CSV → opens in Excel with all columns
2. Batch export PDF → title page + summary + table
3. Batch export ZIP → folder structure: evidence/, reports/, summary
```

---

## TIER 3 — ACCURACY IMPROVEMENTS (Week 7-8, ~22 hours)

---

### DAY 17-18 — Error Level Analysis (ELA) (6 hours)

---

#### TASK 17.1: Implement ELA algorithm on server (3 hours)

**File**: `src/services/forensics.ts` (new file)

```typescript
// src/services/forensics.ts
import sharp from 'sharp'; // Need to install

export interface ELAResult {
  score: number; // 0-100, higher = more likely edited
  heatmapBase64?: string;
  interpretation: 'uniform' | 'patchy' | 'suspicious';
}

export async function performELA(
  buffer: Buffer,
  originalMimeType: string
): Promise<ELAResult> {
  // Step 1: Resave at known quality
  const resaved = await sharp(buffer)
    .jpeg({ quality: 85 })
    .toBuffer();

  // Step 2: Compare pixel by pixel
  const originalPixels = await sharp(buffer).raw().toBuffer();
  const resavedPixels = await sharp(resaved).raw().toBuffer();

  if (originalPixels.length !== resavedPixels.length) {
    return { score: 0, interpretation: 'uniform' };
  }

  // Step 3: Calculate difference per pixel
  let totalDiff = 0;
  let maxDiff = 0;
  const diffMap: number[] = [];

  for (let i = 0; i < originalPixels.length; i += 3) {
    const diff = Math.abs(originalPixels[i] - resavedPixels[i]) +
                 Math.abs(originalPixels[i+1] - resavedPixels[i+1]) +
                 Math.abs(originalPixels[i+2] - resavedPixels[i+2]);
    totalDiff += diff;
    maxDiff = Math.max(maxDiff, diff);
    diffMap.push(diff);
  }

  const avgDiff = totalDiff / (originalPixels.length / 3);

  // Step 4: Analyze variance in differences
  const variance = diffMap.reduce((acc, val) => acc + (val - avgDiff) ** 2, 0) / diffMap.length;
  const stdDev = Math.sqrt(variance);

  // Step 5: Interpretation
  // Uniform differences → likely single-source (camera or AI)
  // High variance differences → likely edited (spliced regions compress differently)
  const uniformityRatio = avgDiff > 0 ? stdDev / avgDiff : 0;

  let interpretation: 'uniform' | 'patchy' | 'suspicious';
  let score: number;

  if (uniformityRatio < 0.5) {
    interpretation = 'uniform';
    score = Math.min(30, avgDiff * 2); // Low score = not edited
  } else if (uniformityRatio < 1.0) {
    interpretation = 'suspicious';
    score = Math.min(70, 30 + avgDiff * 3);
  } else {
    interpretation = 'patchy';
    score = Math.min(95, 50 + avgDiff * 5);
  }

  return { score, interpretation };
}
```

**Install sharp**:
```bash
npm install sharp
npm install -D @types/sharp
```

---

#### TASK 17.2: Add ELA to analysis pipeline (2 hours)

**In `server.ts`**, modify the analyze endpoint to run ELA before/after Gemini:

```typescript
// Run ELA before Gemini
let elaResult: ELAResult | null = null;
try {
  const buffer = Buffer.from(imageBase64, 'base64');
  elaResult = await performELA(buffer, resolvedMimeType);
} catch (elaErr) {
  console.warn("ELA analysis failed (non-critical):", elaErr);
}

// Include ELA in the response
res.json({
  ...analysis,
  elaScore: elaResult?.score || null,
  elaInterpretation: elaResult?.interpretation || null,
});
```

---

#### TASK 17.3: Display ELA in UI (1 hour)

**In VerdictCard or a new section**, add:
```typescript
{elaScore !== null && (
  <div className="mt-4 p-3 border border-[#141414] rounded-lg bg-black/30">
    <p className="text-[9px] uppercase font-mono text-[#F27D26] mb-1">
      Error Level Analysis
    </p>
    <div className="flex items-center gap-3">
      <span className="text-xs opacity-70">Score: {elaScore}</span>
      <span className={`text-[10px] px-2 py-0.5 rounded ${
        interpretation === 'uniform' ? 'bg-green-500/10 text-green-500' :
        interpretation === 'suspicious' ? 'bg-yellow-500/10 text-yellow-500' :
        'bg-red-500/10 text-red-500'
      }`}>{interpretation}</span>
    </div>
  </div>
)}
```

---

### DAY 17-18 CHECKPOINT

```
1. ELA runs alongside Gemini analysis
2. ELA score + interpretation shown in UI
3. Edited images show higher ELA scores than unedited
4. ELA doesn't crash if image is too small
```

---

### DAY 19-20 — Prompt Similarity Analysis (5 hours)

---

#### TASK 19.1: Model fingerprinting (2 hours)

**File**: `src/services/forensics.ts` (add function)

```typescript
export interface ModelFingerprint {
  likelyModels: Array<{ name: string; confidence: number }>;
  estimatedAspectRatio: string;
  resolutionPattern: string;
}

export function fingerprintModel(width: number, height: number): ModelFingerprint {
  const ratio = width / height;
  const resolution = `${width}x${height}`;

  // Known model resolution patterns
  const MODEL_PATTERNS: Array<{
    name: string;
    check: (w: number, h: number) => boolean;
  }> = [
    // Midjourney v5/v6
    { name: 'Midjourney v6', check: (w, h) => [1456, 1456, 1824, 1024, 2048].includes(w) && [816, 1456, 1024, 1824, 2048].includes(h) },
    { name: 'Midjourney v5', check: (w, h) => [1024, 1456].includes(w) && [1024, 816].includes(h) },
    // DALL-E 3
    { name: 'DALL-E 3', check: (w, h) => [1792, 1024].includes(w) && [1024, 1792].includes(h) },
    // Stable Diffusion
    { name: 'Stable Diffusion XL', check: (w, h) => [1024, 1024] === [w, h] || [1216, 832] === [w, h] },
    { name: 'Stable Diffusion 1.5', check: (w, h) => [512, 512] === [w, h] || [768, 768] === [w, h] },
    // Adobe Firefly
    { name: 'Adobe Firefly', check: (w, h) => [2048, 2048] === [w, h] },
  ];

  const matches = MODEL_PATTERNS
    .filter(p => p.check(width, height))
    .map(p => ({ name: p.name, confidence: 70 }));

  if (matches.length === 0) {
    matches.push({ name: 'Unknown / Custom resolution', confidence: 50 });
  }

  return {
    likelyModels: matches,
    estimatedAspectRatio: ratio > 1 ? `${Math.round(ratio * 100)}:100` : `${Math.round((1/ratio) * 100)}:100`,
    resolutionPattern: resolution,
  };
}
```

---

#### TASK 19.2: Style keyword extraction via Gemini (2 hours)

**In `server.ts`**, add a new mode or parameter to the prompt:

When `extractStyle` flag is true, modify the prompt to:
```
After completing the forensic analysis, also extract style keywords from this image.

Output the following ADDITIONAL fields:
"styleKeywords": string[],
"likelyArtistReferences": string[],
"mediumEstimate": string,
"lightingDescription": string

For each keyword, indicate confidence: "high", "medium", "low"
```

---

#### TASK 19.3: Output with confidence bands (1 hour)

**In UI**, display with explicit confidence:

```typescript
<div className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A]">
  <p className="text-[9px] uppercase font-mono text-[#F27D26] mb-2">Style Analysis (Experimental — Low Confidence)</p>
  <p className="text-xs opacity-60">This feature is experimental. Results may not be accurate.</p>
  {styleKeywords?.map((kw: string, i: number) => (
    <span key={i} className="inline-block text-[10px] px-2 py-1 bg-[#F27D26]/10 rounded mr-1 mb-1">{kw}</span>
  ))}
</div>
```

---

### DAY 19-20 CHECKPOINT

```
1. Model fingerprint shows likely model(s) with confidence
2. Style keywords extracted and displayed
3. ALL style features labeled "Experimental — Low Confidence"
```

---

### DAY 21 — Final Testing (5 hours)

---

#### TASK 21.1: Full test suite run (2 hours)

```bash
node test-accuracy.js
```

Update the test script to include ELA score:
```javascript
results.push({
  file: path.basename(filePath),
  expected,
  got: result.classification,
  confidence: result.confidenceLevel,
  aiScore: result.aiLikelihood,
  realScore: result.realLikelihood,
  elaScore: result.elaScore,
  correct: result.classification === expected
});
```

---

#### TASK 21.2: Accuracy calculation (1 hour)

Calculate:
- True Positives (correctly identified AI)
- True Negatives (correctly identified Real)
- False Positives (Real marked as AI)
- False Negatives (AI marked as Real)
- Precision, Recall, F1 Score
- Accuracy %

**Document all of this in `docs/accuracy.md`**.

---

#### TASK 21.3: Document limitations (1 hour)

Create `docs/limitations.md`:

```markdown
# ForensicTrace — Known Limitations

## Detection Accuracy
- Current accuracy: ~83% (see accuracy.md)
- Not suitable as sole evidence in legal proceedings
- Accuracy varies by image type (low light = worse)
- AI model detection is experimental

## Technical
- Maximum file size: 15MB
- Supported formats: JPEG, PNG, WebP
- Batch processing: sequential (no parallel)
- No offline analysis (requires Gemini API)

## Prompt Analysis (Experimental)
- Does NOT recover the original prompt
- Style keywords are guesses with low confidence
- Model fingerprinting only works for known model resolutions
```

---

#### TASK 21.4: README update (1 hour)

Update `README.md` with:
```markdown
# ForensicTrace — Digital Image Forensics Tool

## Quick Start
1. `npm install`
2. Set `GEMINI_API_KEY` in `.env`
3. `npm run dev`

## Features
- Single image AI/Real classification
- EXIF metadata extraction
- SHA-256 integrity hashing
- PDF forensic report generation
- Batch analysis with CSV export
- Error Level Analysis (experimental)
- Style keyword extraction (experimental)

## Accuracy
See [docs/accuracy.md](docs/accuracy.md) for current baseline.

## Limitations
See [docs/limitations.md](docs/limitations.md).

## Disclaimer
This tool is for research and investigative purposes only.
Not admissible as sole evidence in legal proceedings.
```

---

## COMPLETE FILE LIST (All files that will be created or modified)

### Modified files:
| File | Changes |
|------|---------|
| `.gitignore` | Add `.env` |
| `package.json` | Fix clean script, add deps |
| `server.ts` | Validation, rate limit, EXIF, ELA, better prompt, retry logic |
| `tsconfig.json` | Maybe no changes |
| `vite.config.ts` | Maybe no changes |
| `index.html` | Maybe no changes |
| `src/App.tsx` | Major refactor: new components, states, handlers |
| `src/index.css` | Maybe no changes |
| `src/components/MetadataInspector.tsx` | Remove dead import or repurpose |

### New files:
| File | Purpose |
|------|---------|
| `src/components/VerdictCard.tsx` | Classification display with score bars |
| `src/components/EvidenceList.tsx` | Expandable evidence/issues list |
| `src/components/MetadataPanel.tsx` | EXIF display with sections |
| `src/components/BatchQueue.tsx` | Batch upload queue |
| `src/services/forensics.ts` | ELA algorithm, model fingerprinting |
| `src/utils/pdfGenerator.ts` | PDF report generation |
| `src/utils/reportTemplates.ts` | Report constants, case ID generation |
| `test-accuracy.js` | Accuracy testing script |
| `test-images/real/` | Test images (user provides) |
| `test-images/ai/` | Test images (user provides) |
| `docs/accuracy.md` | Accuracy documentation |
| `docs/limitations.md` | Limitations documentation |
| `FORENSICTRACE_PLAN.md` | This plan |

### Dependencies to install:
```bash
npm install express-rate-limit sharp
npm install -D @types/express-rate-limit @types/sharp
```

---

## ONE-PAGE EXECUTION SUMMARY

```
TIER 0 (Week 1-2) — FOUNDATION
├── Day 1: Security + bug fixes (3h)
├── Day 2: Error handling + loading states (3h)
├── Day 3: Better prompt + few-shot examples (4h)
├── Day 4-5: EXIF extraction + hash (6h)
├── Day 6-7: PDF report generation (6h)
└── ≈22 hours total

TIER 1 (Week 3-4) — POLISH
├── Day 8: Deep scan fix + prompt (2h)
├── Day 9-10: Result display components (5h)
├── Day 11: Enhanced PDF report (3.5h)
├── Day 12: Testing + validation (5.5h)
└── ≈16 hours total

TIER 2 (Week 5-6) — BATCH
├── Day 13-14: Upload queue + progress (6h)
├── Day 15: Table sorting + filtering (5h)
├── Day 16: CSV/PDF/ZIP export (5h)
└── ≈16 hours total

TIER 3 (Week 7-8) — ACCURACY
├── Day 17-18: ELA algorithm (6h)
├── Day 19-20: Style analysis (5h)
├── Day 21: Final testing (5h)
└── ≈16 hours total

TOTAL: ≈70 hours over ~8 weeks
AVERAGE: ~2-3 hours/day
```

**Start with Day 1**. Tell me "go" when ready.
