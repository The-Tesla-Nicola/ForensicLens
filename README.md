# ForensicTrace

Professional digital image forensics tool for detecting AI-generated, edited, and authentic images.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Usage](#usage)
7. [API Reference](#api-reference)
8. [Report Generation](#report-generation)
9. [Project Structure](#project-structure)
10. [Troubleshooting](#troubleshooting)

---

## Overview

ForensicTrace is a web application that analyzes images to determine if they are **Real** (authentic photograph), **AI-generated** (created by generative AI), or **Edited** (digitally manipulated). It uses a multi-model approach combining cloud-based AI vision models with local forensic techniques to produce professional-grade analysis.

### Key Features

- **Multi-model detection pipeline**: HuggingFace Aya Vision 32B + NVIDIA LLaMA 3.2 90B Vision
- **Local forensic analysis**: Error Level Analysis (ELA) + EXIF metadata extraction
- **Weighted voting system**: Combines all signals for final classification
- **Reverse prompt generation**: Reconstructs a text prompt for AI-generated images
- **Batch processing**: Analyze multiple images concurrently with sorting and filtering
- **PDF report generation**: Court-ready forensic reports with chain of custody
- **Case archive export**: ZIP packages with evidence, reports, and metadata

---

## How It Works

### Analysis Pipeline

When you submit an image, ForensicTrace runs a multi-stage pipeline:

```
Image Upload
    |
    v
[1] Client-side resize (max 1920px)
    |
    v
[2] Server receives image, validates (type, size, format)
    |
    +---> [3] Error Level Analysis (ELA) -- local, instant
    |
    +---> [4] HuggingFace Aya Vision 32B -- cloud, 2-pass voting
    |
    v
[5] NVIDIA LLaMA 3.2 90B Vision -- cloud, detailed forensic analysis
    |
    v
[6] Post-processing: normalize likelihoods, reconcile classification
    |
    v
[7] Combined voting: NVIDIA result + HF result + ELA + EXIF camera data
    |
    v
[8] If AI-generated/Edited: generate reverse prompt via NVIDIA
    |
    v
[9] Return full result to frontend
```

### Signal Sources

| Source | Type | What It Does |
|--------|------|--------------|
| **HuggingFace Aya Vision 32B** | Cloud (free API) | Binary AI detection classifier. Runs 2 passes with different temperatures for majority vote. |
| **NVIDIA LLaMA 3.2 90B Vision** | Cloud (free API) | Detailed forensic analysis. Provides classification, likelihood scores, evidence, and narrative summary. |
| **Error Level Analysis (ELA)** | Local (server) | Re-saves image at JPEG quality 95, compares pixel differences. High variance = possible editing. Low variance = possible AI generation. |
| **EXIF Metadata** | Local (server) | Checks for camera make/model, lens, software traces. Camera EXIF = strong Real signal. AI software signatures (Midjourney, DALL-E, etc.) = AI signal. |

### Voting Logic

The final classification is determined by combining all signals:

1. **Camera EXIF override**: If the image has camera EXIF data (make, model, lens), it is classified as **Real** regardless of other signals.
2. **ELA + HF agreement**: If ELA is very uniform AND HF says AI, the classification overrides to **AI-generated**.
3. **Extremely low ELA + HF AI**: ELA score < 0.7 with HF agreement overrides to **AI-generated**.
4. **Agreement boost**: If NVIDIA and HF agree on a classification, the likelihood is boosted by +10%.
5. **Fallback**: NVIDIA classification is used as the primary result, with HF/ELA/EXIF as supporting signals.

### Classification Types

| Classification | Meaning |
|----------------|---------|
| **Real** | Authentic photograph. May have professional lighting, color grading, filters. These are normal in photography. |
| **AI-generated** | Created by generative AI (Midjourney, DALL-E, Stable Diffusion, etc.). Shows specific structural errors like fused fingers, garbled text, or impossible geometry. |
| **Edited** | Real photograph that was digitally manipulated (Photoshop compositing, clone stamp, cut/paste). |
| **Mixed/Uncertain** | Evidence is conflicting. Cannot definitively classify. |

### Confidence Levels

| Level | Meaning |
|-------|---------|
| **High** | Multiple independent signals agree. Strong evidence present. |
| **Medium** | Some evidence present but not fully corroborated. |
| **Low** | Weak, ambiguous, or insufficient evidence. |

---

## Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS 4
- **Backend**: Express.js + TypeScript (via tsx)
- **Build**: Vite (frontend) + esbuild (server bundle)
- **AI Models**: HuggingFace Aya Vision 32B (free), NVIDIA LLaMA 3.2 90B Vision (free)
- **Image Processing**: sharp (resize), exifr (EXIF), jsPDF (reports)

### Multi-Model Architecture

```
                    +-----------------------+
                    |   Client (React)      |
                    |   - Image upload      |
                    |   - Results display   |
                    |   - PDF generation    |
                    +-----------+-----------+
                                |
                    POST /api/analyze
                                |
                    +-----------v-----------+
                    |   Express Server      |
                    |   - Validation        |
                    |   - ELA (local)       |
                    |   - EXIF (local)      |
                    +-----------+-----------+
                                |
              +-----------------+-----------------+
              |                                   |
    +---------v---------+             +-----------v-----------+
    | HuggingFace API   |             | NVIDIA API            |
    | Aya Vision 32B    |             | LLaMA 3.2 90B Vision  |
    | (Detector)        |             | (Explainer)           |
    +-------------------+             +-----------------------+
              |                                   |
              +-----------------+-----------------+
                                |
                    +-----------v-----------+
                    |   Voting Logic        |
                    |   - Combine signals   |
                    |   - Final verdict     |
                    +-----------------------+
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Main analysis endpoint. Accepts base64 image, returns classification with all signals. |
| `/api/metadata` | POST | Extracts EXIF metadata, software traces, GPS, and SHA-256 hash. |
| `/api/reverse-prompt` | POST | Generates a reverse-engineered prompt for AI/edited images. |
| `/api/download-source` | GET | Downloads the project source as a ZIP file. |

---

## Installation

### Prerequisites

- **Node.js** v18 or higher
- **NVIDIA API key** (free at https://build.nvidia.com)
- **HuggingFace API key** (free at https://huggingface.co/settings/tokens)

### Steps

1. Clone the repository:
```bash
git clone <repository-url>
cd RPE-BY-HARISH--main
```

2. Install dependencies:
```bash
npm install
```

3. Create your `.env` file:
```bash
cp .env.example .env
```

4. Edit `.env` and add your API keys:
```
NV_API_KEY="your-nvidia-api-key"
NV_BASE_URL="https://integrate.api.nvidia.com/v1"
NV_MODEL="meta/llama-3.2-90b-vision-instruct"
hugging_face_api="your-huggingface-api-key"
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NV_API_KEY` | Yes | - | NVIDIA API key for LLaMA 3.2 90B Vision |
| `NV_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | NVIDIA API endpoint |
| `NV_MODEL` | No | `meta/llama-3.2-90b-vision-instruct` | NVIDIA model ID |
| `hugging_face_api` | Yes | - | HuggingFace API key for Aya Vision |

### Free API Access

Both APIs are available for free:

- **NVIDIA**: Sign up at https://build.nvidia.com to get a free API key. Rate limits apply.
- **HuggingFace**: Sign up at https://huggingface.co and create a token at https://huggingface.co/settings/tokens. The free tier includes access to Aya Vision 32B via the router endpoint.

### NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `tsx server.ts` | Start development server with hot reload |
| `npm run build` | `vite build && esbuild ...` | Build frontend + bundle server for production |
| `npm start` | `node dist/server.cjs` | Start production server |
| `npm run lint` | `tsc --noEmit` | Type-check the project |
| `npm run clean` | `rimraf dist server.js` | Clean build artifacts |

---

## Usage

### Single Image Analysis

1. Open the app at `http://localhost:3000`
2. Click the upload area or drag and drop an image
3. **Optional**: Toggle **Deep Scan** (3 analysis passes for higher accuracy) or **Extract Style** (experimental style analysis)
4. Click **Initialize Forensic Analysis**
5. Wait for results (typically 15-30 seconds)
6. Review the verdict card, evidence list, ELA score, and metadata panel

### Batch Analysis

1. Click **Batch Matrix** in the header toggle
2. Upload multiple images via drag and drop or the **Append Evidence** button
3. Toggle **Deep Scan** if needed
4. Click **Process Pending Matrix** to analyze all pending images
5. Sort by clicking column headers (filename, classification, AI likelihood, consistency, timestamp)
6. Filter using the dropdown (All, AI-Generated, Real, Edited, Uncertain)
7. Click any row to see detailed results for that image

### Reverse Prompt Generation

For images classified as AI-generated or Edited:

1. After analysis completes, click **Reverse Engineer Prompt**
2. The system sends the image to NVIDIA LLaMA 3.2 90B Vision with a photography/art direction prompt
3. View the reconstructed prompt, style, and confidence
4. Click **Copy Prompt to Clipboard** to use it

### Export Options

**Single Image:**
- **Generate Court Report**: Downloads a multi-page PDF with classification, evidence, chain of custody, and integrity verification
- **Export Case (ZIP)**: Downloads a ZIP with the original image and a JSON metadata file

**Batch:**
- **Export CSV**: Spreadsheet with all results
- **Export PDF**: Multi-page summary report for all images
- **Export ZIP**: Complete archive with images, individual reports, and case summary

---

## API Reference

### POST /api/analyze

Main analysis endpoint.

**Request:**
```json
{
  "imageBase64": "<base64-encoded image>",
  "mimeType": "image/jpeg",
  "deepScan": false,
  "extractStyle": false
}
```

**Response:**
```json
{
  "classification": "AI-generated",
  "aiLikelihood": 85,
  "realLikelihood": 10,
  "editedLikelihood": 5,
  "consistencyScore": 72,
  "confidenceLevel": "High",
  "keyEvidence": ["Observation 1", "Observation 2"],
  "detectedIssues": ["Issue 1"],
  "mostLikelySource": "AI-generated image",
  "forensicSummary": "2-3 sentence summary of findings.",
  "finalVerdict": "One clear sentence.",
  "reversePrompt": "detailed art direction brief...",
  "reversePromptStyle": "digital art",
  "reversePromptConfidence": "Medium",
  "hfDetection": { "label": "AI-generated", "confidence": 100 },
  "elaScore": 0.45,
  "elaInterpretation": "very_uniform"
}
```

**Limits:**
- Max image size: 15MB base64
- Rate limit: 30 requests per minute
- Request timeout: 600 seconds
- Allowed types: `image/jpeg`, `image/png`, `image/webp`

### POST /api/metadata

Extracts EXIF metadata and file hash.

**Request:**
```json
{
  "imageBase64": "<base64-encoded image>"
}
```

**Response:**
```json
{
  "exif": { "Make": "Canon", "Model": "EOS R5", ... },
  "hash": "sha256-hash",
  "softwareTraces": [{ "field": "Software", "value": "Adobe Photoshop", "aiRelated": false }],
  "hasExif": true,
  "dimensions": { "width": 4000, "height": 3000 },
  "gps": { "lat": 40.7128, "lng": -74.0060 }
}
```

### POST /api/reverse-prompt

Generates a reverse-engineered prompt for AI/edited images.

**Request:**
```json
{
  "imageBase64": "<base64-encoded image>",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "prompt": "Detailed photography/art direction brief...",
  "style": "digital art",
  "confidence": "Medium",
  "notes": "Brief observation"
}
```

---

## Report Generation

### PDF Report Structure

The generated PDF forensic report contains 3 pages:

**Page 1: Header & Verdict**
- Case ID and timestamp
- Thumbnail of the analyzed image
- Classification verdict (color-coded: red=AI, green=Real, yellow=Edited)
- Likelihood scores for all three categories
- Confidence level and consistency score
- Forensic summary narrative

**Page 2: Evidence & Verdict**
- Supporting evidence items
- Detected issues/warnings
- Final verdict statement
- Reverse-engineered prompt (if AI-generated/Edited)

**Page 3: Integrity & Chain of Custody**
- Case ID, analysis date, SHA-256 hash
- Classification and confidence
- System identification (ForensicTrace v2.4.0 / NVIDIA LLaMA 3.2 90B Vision)
- Chain of custody log (ingestion, metadata extraction, AI analysis, report generation)
- Legal disclaimer
- Watermark on every page

### Case ID Format

Each analysis generates a unique case ID: `FG-<timestamp>-<random>`

---

## Project Structure

```
ForensicTrace/
|
|-- server.ts                    # Express server with all API endpoints
|                                   - Image validation and resize
|                                   - ELA computation (local)
|                                   - EXIF extraction (local)
|                                   - HuggingFace Aya Vision detector
|                                   - NVIDIA LLaMA analysis
|                                   - Combined voting logic
|                                   - Reverse prompt generation
|                                   - Rate limiting and API key guard
|
|-- src/
|   |-- App.tsx                 # Main React component
|   |                               - Single and batch analysis UI
|   |                               - Image upload with drag-and-drop
|   |                               - Client-side resize (1920px)
|   |                               - Results display and filtering
|   |                               - PDF and ZIP export
|   |                               - LocalStorage persistence
|   |
|   |-- components/
|   |   |-- VerdictCard.tsx     # Classification result display
|   |   |                           - Color-coded verdict (AI/Real/Edited)
|   |   |                           - Likelihood score bars
|   |   |                           - Consistency score
|   |   |
|   |   |-- EvidenceList.tsx    # Evidence and issues display
|   |   |                           - Key evidence items
|   |   |                           - Detected issues
|   |   |                           - Forensic summary
|   |   |
|   |   |-- MetadataPanel.tsx   # EXIF metadata display
|   |                               - Camera info (make, model, lens)
|   |                               - GPS coordinates
|   |                               - File dimensions
|   |                               - Software traces
|   |
|   |-- utils/
|       |-- pdfGenerator.ts     # jsPDF report generation
|       |                           - 3-page forensic report
|       |                           - Court-admissible format
|       |                           - Chain of custody
|       |
|       |-- reportTemplates.ts  # Report styles and case ID generator
|
|-- test-images/                # Test dataset
|   |-- real/                   # 4 authentic photographs
|   |-- ai/                     # 4 AI-generated images
|   |-- edited/                 # 3 digitally edited images
|   |-- results/                # Test result JSONs
|
|-- test-accuracy.mjs           # Accuracy test script
|-- test-deep.mjs               # Deep scan test script
|-- test-hf-vision.mjs          # HuggingFace API test script
|
|-- index.html                  # HTML entry point
|-- package.json                # Dependencies and scripts
|-- tsconfig.json               # TypeScript configuration
|-- vite.config.ts              # Vite + Tailwind configuration
|-- .env.example                # Environment variable template
|-- .gitignore                  # Git ignore rules
```

---

## Troubleshooting

### Common Issues

**"Analysis timed out"**
- The NVIDIA API may be slow. The server retries 2 times automatically with 3s delay.
- Try again in a few minutes. Large images take longer to process.

**"API rate limit exceeded"**
- NVIDIA or HuggingFace free tier limits reached. Wait 1-2 minutes and retry.

**"fetch failed" / ConnectTimeoutError**
- Network connectivity issue to the API servers. Check your internet connection.
- The server will automatically retry up to 2 times.

**No results from HuggingFace detector**
- Ensure `hugging_face_api` is set in your `.env` file.
- The HuggingFace API may be temporarily unavailable. Analysis still works using NVIDIA alone.

**Build fails**
- Run `npm run lint` to see type errors.
- Ensure all dependencies are installed: `npm install`.

**Port 3000 already in use**
- Kill any existing server: use `netstat -ano | findstr :3000` to find the PID, then `taskkill /PID <pid> /F`.

### Supported Image Formats

| Format | Supported | Notes |
|--------|-----------|-------|
| JPEG | Yes | Best compatibility. Recommended for analysis. |
| PNG | Yes | Lossless. Good for screenshots. |
| WebP | Yes | Modern format. Server-side conversion to JPEG for API calls. |

### Size Limits

- **Client-side**: Images resized to max 1920px before upload
- **Server-side**: Further resized to 768px for NVIDIA API, 512px for HuggingFace API
- **Max upload**: 15MB base64 (~11MB original file)

---

*ForensicTrace v2.4.0*
