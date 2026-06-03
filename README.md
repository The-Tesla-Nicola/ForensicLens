# ForensicTrace — Digital Image Forensics Tool

AI-powered digital forensics tool for detecting AI-generated vs real images, extracting metadata, and generating forensic reports.

## Quick Start

1. `npm install`
2. Set `GEMINI_API_KEY` in `.env`
3. `npm run dev`

## Features

- Single image AI/Real classification with confidence scoring
- Deep Scan mode (3-pass analysis for high precision)
- EXIF metadata extraction (camera, GPS, software traces)
- SHA-256 integrity hashing
- Error Level Analysis (ELA) for tamper detection
- Style keyword extraction (experimental)
- PDF forensic report generation with chain of custody
- Batch analysis with progress tracking
- CSV / PDF / ZIP batch export
- Filterable, sortable batch results table

## Accuracy

See [docs/accuracy.md](docs/accuracy.md) for current baseline.

## Limitations

See [docs/limitations.md](docs/limitations.md).

## Disclaimer

This tool is for research and investigative purposes only.
Not admissible as sole evidence in legal proceedings.
