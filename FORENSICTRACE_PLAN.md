# FORENSICTRACE — Implementation Plan v2 (Honest Edition)

## Philosophy
- Ship the smallest useful thing first
- Validate before adding complexity
- No feature is added unless the current tier works reliably
- Estimates assume ~2-3 hours/day of focused work

---

## TIER 0: Foundation (Week 1-2)
**Goal: Working app that doesn't crash, leak keys, or give garbage results**

### Day 1 — Security & Bug Fixes (3 hours)

| Task | Time | Detail | Done when |
|------|------|--------|-----------|
| Remove live API key from `.env` | 10 min | `git rm --cached .env`, add to `.gitignore`, rotate key at Google AI Studio, generate new key, put in local `.env` only | No API key in repo |
| Fix Gemini model name | 5 min | `server.ts:123` — change `gemini-3-flash-preview` to `gemini-2.0-flash` | Model call works |
| Remove dead MetadataInspector import | 5 min | `App.tsx:38` — delete line, remove unused import | Zero unused imports |
| Add input validation | 1.5 hr | Check: file type (jpg/png/webp), file size (<15MB), base64 is valid base64, mimeType is known | All bad inputs return 400 with message |
| Add express-rate-limit | 30 min | Install `express-rate-limit`, apply to `/api/analyze`: 10 req/min per IP | Rapid clicking yields 429 |
| Fix clean script for Windows | 5 min | `package.json` — replace `rm -rf dist server.js` with `npx rimraf dist server.js` | `npm run clean` works on Win |
| Install missing types | 5 min | `npm install -D @types/react @types/react-dom` | No TS errors |

**Checkpoint T0**: `npm run dev` starts, upload an image, the API responds, bad inputs don't crash.

### Day 2 — Error Handling & User Feedback (3 hours)

| Task | Time | Detail | Done when |
|------|------|--------|-----------|
| Handle Gemini JSON parse failures | 1 hr | `server.ts:165` — wrap `JSON.parse` in try-catch, return `{ error: "Analysis failed", fallback: true }` | Bad Gemini response doesn't crash server |
| Handle Gemini timeout/rate-limit | 1 hr | Add 30s fetch timeout, retry once on 429/503 | Long delays show "retrying..." not white screen |
| Client-side error display | 30 min | Show error banner with human-readable message + retry button | User always knows what went wrong |
| Loading states | 30 min | Disable buttons during analysis, show spinner with elapsed time | No accidental double-clicks |

**Checkpoint T1**: Upload a corrupted file → see error. Upload a valid file → spinner. Network off → fail gracefully.

### Day 3 — Improved Analysis Prompt (4 hours)

| Task | Time | Detail | Done when |
|------|------|--------|-----------|
| Add few-shot examples to prompt | 2 hr | Include 2 real photo descriptions + 2 AI image descriptions with their correct verdicts. Base them on real files you test with. | Prompt has examples before asking |
| Make confidence scoring stricter | 1 hr | Force Gemini to explain WHY a score is given. Add: "For each evidence point, specify if it's strong/moderate/weak evidence." | Scores have backing reasoning |
| Add classification guardrails | 1 hr | If confidence < 60%, return "Uncertain" instead of guessing | No confident wrong answers |
| Test on 10 images | 30 min | 5 real + 5 AI. Log: verdict, confidence, actual truth. | Baseline accuracy documented |

**Checkpoint T3**: `docs/baseline_accuracy.md` exists with results from 10+ test images.

### Day 4-5 — EXIF Extraction (6 hours)

| Task | Time | Detail | Done when |
|------|------|--------|-----------|
| Deep exifr integration | 2 hr | Parse: all standard EXIF tags, MakerNotes, GPS, XMP, ICC profile. Config: `{ full: true, multiSegment: true }` | Every parseable field extracted |
| AI-tool signature detection | 1.5 hr | Check EXIF `Software` field for: "Midjourney", "Stable Diffusion", "DALL-E", "Adobe Firefly", "NovelAI", "GIMP", "Photoshop". Also check XMP metadata from AI tools. | Report shows "Software: Midjourney v6" if present |
| Metadata display in UI | 1 hr | Expandable "Metadata Panel" with: Camera info, GPS, date, software, ICC profile, file hash | User can expand and see full EXIF |
| Handle stripped/missing EXIF | 30 min | If no EXIF, show: "No metadata found — possible stripping or AI generation indicator" | No empty boxes |
| SHA-256 hash generation | 1 hr | `crypto.createHash('sha256')` on server before analysis. Return hash in response. Display in UI and report. | Every analysis has a file fingerprint |

**Checkpoint T4**: Upload phone photo → see camera model, date, GPS coords. Upload AI image → see "No metadata" or "Software: Midjourney".

### Day 6-7 — PDF Report (6 hours)

| Task | Time | Detail | Done when |
|------|------|--------|-----------|
| Design report layout | 30 min | Sketch on paper: header (logo + case ID), classification box, metadata table, evidence list, hash, footer | Design decided |
| Implement PDF structure | 2 hr | jsPDF: case ID (auto-generated FG-XXXXX), date, image thumbnail, verdict with color coding | Single page report |
| Add forensic summary section | 1 hr | Include: classification, AI likelihood %, real likelihood %, consistency score, key evidence bullets | Summary readable at a glance |
| Add metadata section | 1 hr | Table of: Camera, Software, Date, GPS, File Hash, Dimensions | All metadata in report |
| Add hash + integrity section | 30 min | Show SHA-256, timestamp, note: "Hash verified at time of analysis" | Tamper-evident section |
| Download button | 30 min | Click → PDF downloads with filename `ForensicTrace_CASEID.pdf` | Button works in both single + batch |

**Checkpoint T5**: Analyze image → click "Download PDF" → report opens with correct data.

---

## TIER 1: Single Image Analysis Polish (Week 3-4)
**Goal: Reliable single-image analysis you'd show someone**

### Day 8 — Deep Scan Toggle Fix

| Task | Time | Detail |
|------|------|--------|
| Split deepScan into singleDeepScan + batchDeepScan | 1 hr |
| Improve deep scan prompt | 1 hr | Instead of appending text, use a completely different prompt path with stricter instructions |
| Add deep scan indicator | 30 min | UI shows "DEEP SCAN ACTIVE" badge with different color |

### Day 9-10 — Result Display Improvements

| Task | Time | Detail |
|------|------|--------|
| Better verdict card design | 2 hr | Color-coded (orange=AI, green=Real, yellow=Uncertain), confidence meter bar |
| Evidence/issue list | 1.5 hr | Expandable sections for evidence supporting verdict, detected issues, forensic summary |
| Sidebar with metadata panel | 1.5 hr | Tappable sections: EXIF, file info, hash, software traces |
| Responsive layout fixes | 1 hr | Mobile: stack vertically. Desktop: image left, results right |

### Day 11 — Enhanced Report

| Task | Time | Detail |
|------|------|--------|
| Multi-page PDF | 2 hr | Page 1: verdict + image. Page 2: metadata. Page 3: evidence details |
| Add chain-of-custody section | 1 hr | "Analysis performed: date, system. Hash verified at time of analysis." |
| Watermark/header every page | 30 min | "FORENSICTRACE — Case FG-XXXXX" on every page |
| Footer with disclaimer | 30 min | "For research purposes only. Not admissible in court without independent verification." |

### Day 12 — Testing & Validation

| Task | Time | Detail |
|------|------|--------|
| Build test set | 2 hr | Collect: 20 real photos (your phone, downloaded from stock sites), 20 AI images (Midjourney/DALL-E/SD). Save in `test-images/` |
| Run baseline accuracy | 1.5 hr | Analyze all 40, log verdict vs truth, calculate accuracy % |
| Fix obvious failures | 2 hr | For each wrong answer, analyze WHY and fix prompt |
| Document accuracy | 30 min | Update `docs/accuracy.md` with current numbers |

---

## TIER 2: Batch Processing (Week 5-6)
**Goal: Analyze groups of images, export results**

### Day 13-14 — Batch Upload & Queue

| Task | Time | Detail |
|------|------|--------|
| Fix batch upload multiple file handling | 1 hr | Current bug: same filename overwrites. Use unique IDs |
| Batch queue UI | 2 hr | Show list of queued images with thumbnails, filenames, status badges |
| Sequential processing with progress | 2 hr | Process one at a time. Progress bar: "3/10 complete". Cancel button. |
| Handle mid-batch errors | 1 hr | If one fails, continue to next. Show error badge on failed item. |

### Day 15 — Batch Table & Sorting

| Task | Time | Detail |
|------|------|--------|
| Sortable results table | 2 hr | Click column header to sort: filename, classification, confidence, date |
| Filter by classification | 1 hr | Dropdown: All, AI-generated, Real, Edited, Uncertain |
| Reset/clear batch button | 30 min | Clear all results with confirmation |
| Select row → view detail | 1.5 hr | Click a row → show full analysis in the single-view layout |

### Day 16 — Batch Export

| Task | Time | Detail |
|------|------|--------|
| CSV export (improved) | 1.5 hr | Columns: filename, classification, AI%, Real%, Edited%, consistency, source, timestamp, hash |
| Batch PDF export | 2 hr | Generate single PDF with all results as a table + summary page |
| ZIP archive export | 1.5 hr | Include: all images, CSV, individual PDFs, metadata JSON |

---

## TIER 3: Detection Accuracy Improvements (Week 7-8)
**Goal: Improve beyond baseline Gemini-only accuracy**

### Day 17-18 — Error Level Analysis (ELA)

| Task | Time | Detail |
|------|------|--------|
| Implement ELA algorithm | 3 hr | Server-side: resave image at JPEG quality 90%, compare pixel-by-pixel with original, highlight differences |
| ELA visualization | 1.5 hr | Return ELA heatmap image, display in UI |
| ELA scoring | 1.5 hr | Uniform ELA = likely AI/camera. Patchy ELA = likely edited. Score 0-100. |
| Integrate into analysis pipeline | 2 hr | Run ELA alongside Gemini, use simple average for final score |

### Day 19-20 — Prompt Similarity Analysis (NOT reconstruction)

| Task | Time | Detail |
|------|------|--------|
| Model fingerprinting | 2 hr | Check resolution ratios, watermark patterns, compression signatures → classify likely model |
| Style keyword extraction | 2 hr | Gemini analyzes image and outputs style keywords: "cinematic, photorealistic, dramatic lighting" |
| Parameter estimation | 1 hr | Rough CFG scale estimate (low/high), aspect ratio detection |
| Confidence-banded output | 1 hr | Every field has a confidence: "Style keywords (70% confidence), Model guess (85%)" |

**Important**: This is NOT prompt reconstruction. It's "here's what the image looks like it could be." Display confidence clearly. Do NOT claim accuracy.

### Day 21 — Final Testing

| Task | Time | Detail |
|------|------|--------|
| Full test suite run | 2 hr | All 40+ images, log every result |
| Accuracy calculation | 1 hr | TP, TN, FP, FN, precision, recall, F1 score |
| Document limitations | 1 hr | What the tool CAN and CANNOT do. Be honest. |
| README update | 1 hr | Complete documentation with example usage |

---

## WHAT WE WILL NOT DO (At least not yet)

| Feature | Reason |
|---------|--------|
| Prompt reverse engineering | Not reliably possible with current AI. We do style analysis instead. |
| Parallel batch processing | Unnecessary for <20 images. Adds complexity bugs. |
| Blockchain verification | Zero demand, high complexity. |
| Custom ML models | Need 10,000+ labeled images. Not realistic. |
| WebSockets for progress | Overkill for sequential processing. |
| Mobile app | Web works fine. PWA later if needed. |
| Multi-user auth | Not until someone asks for it. |

---

## REALISTIC TIMELINE

| Tier | Tasks | Estimated hours | Calendar (at 3hr/day) | Ship value |
|------|-------|----------------|----------------------|------------|
| 0 | Foundation | ~22 | Week 1-2 | Internal testing |
| 1 | Single analysis polish | ~22 | Week 3-4 | Show to friends/mentor |
| 2 | Batch processing | ~22 | Week 5-6 | Demo-ready |
| 3 | Accuracy improvements | ~22 | Week 7-8 | Beta release |
| **Total** | **~88 hours** | | **~8 weeks** | |

This is ~88 hours, not 48. At 3 hours/day, that's about 8 weeks. At 2 hours/day, it's 12 weeks. Be honest with yourself about how much time you have.

---

## DO THIS RIGHT NOW (Next 30 minutes)

```bash
# 1. Secure the key
echo ".env" >> .gitignore
# Manually: go to .env and replace with "your_key_here"
# Manually: generate new key at https://aistudio.google.com

# 2. Fix the model name
# Edit server.ts line 123: "gemini-3-flash-preview" → "gemini-2.0-flash"

# 3. Create test image folder
mkdir test-images
# Download 3 real photos, 3 AI images

# 4. Run the app and test ONE image
npm run dev
# Upload a test image. Does it work? If not, debug.

# 5. Tell me "go" and I start implementing Day 1
```

---

## Verdict

| Question | Answer |
|----------|--------|
| Can you build something useful? | Yes |
| Can you build everything you listed? | No, not in a semester |
| Should you try? | Yes — start with Tier 0, see if it works, then decide on Tier 1 |
| When do you stop planning and start coding? | Now |
