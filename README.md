<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# ForensicTrace: Professional Digital Image Forensics Tool

Advanced AI-powered tool for detecting AI-generated images, edited content, and authentic photographs using multimodal forensic analysis.

## 🔬 Overview

ForensicTrace combines state-of-the-art AI analysis with traditional forensic techniques to provide professional-grade image authentication. The tool analyzes images for signs of AI generation, digital manipulation, and authenticity using:

- **Multimodal AI Analysis**: Leveraging NVIDIA's Nemotron models for deep forensic inspection
- **Error Level Analysis (ELA)**: Detecting compression inconsistencies and digital alterations
- **EXIF Metadata Analysis**: Verifying camera authenticity and detecting metadata tampering
- **Batch Processing**: Analyze hundreds of images efficiently
- **Professional Reporting**: Generate court-admissible reports with integrity verification

## 🚀 Features

### Core Analysis Capabilities
- **AI Generation Detection**: Identifies images from Midjourney, Stable Diffusion, DALL-E, and other AI models
- **Manipulation Detection**: Detects Photoshop edits, cloning, compositing, and other alterations
- **Authenticity Verification**: Confirms genuine camera-captured images
- **Confidence Scoring**: Provides likelihood percentages for each classification
- **Evidence Highlighting**: Points out specific forensic indicators found in the image

### Professional Tools
- **Batch Processing**: Upload and analyze multiple images simultaneously
- **Deep Scan Mode**: Enhanced analysis for challenging cases
- **Style Analysis** (Experimental): Extract artistic style and medium estimates
- **Error Level Analysis**: Detect compression artifacts and alterations
- **Metadata Inspection**: View and analyze EXIF, GPS, and software data

### Reporting & Export
- **Court-Ready PDF Reports**: Professional forensic reports with case IDs and integrity verification
- **Case Archives**: Export evidence packages with reports and original images
- **CSV Export**: Batch results for spreadsheet analysis
- **Source Code Download**: Complete project for audit and modification
- **Chain of Custody Documentation**: Built-in audit trail for legal proceedings

### Security & Reliability
- **Rate Limiting**: Protection against API abuse
- **Input Validation**: Strict file type and size checking
- **Error Handling**: Graceful degradation and informative error messages
- **Local Storage**: Persistent batch results and history
- **Abortable Operations**: Cancel long-running analyses

## 📋 Prerequisites

- Node.js (v18+ recommended)
- NVIDIA API key (for Nemotron model access)
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/forensictrace.git
cd forensictrace
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env.local
```
Edit `.env.local` and add your NVIDIA API key:
```
NV_API_KEY="your_nvidia_api_key_here"
NV_BASE_URL="https://integrate.api.nvidia.com/v1"
NV_MODEL="nvidia/nemotron-3-22b-instruct"
```

## 🖥️ Usage

### Development Mode
```bash
npm run dev
```
The application will be available at `http://localhost:3000`

### Production Build
```bash
npm run build
npm start
```
The application will be available at `http://localhost:3000`

## 🔍 Analysis Workflow

### Single Image Analysis
1. Click the upload area or drag & drop an image
2. Optional: Enable Deep Scan for enhanced analysis
3. Click "Initialize Forensic Analysis"
4. Review results including:
   - Classification (AI-generated, Real, Edited, Mixed/Uncertain)
   - Confidence levels and likelihood percentages
   - Supporting evidence and detected issues
   - Forensic summary and final verdict
5. Generate reports or export case data as needed

### Batch Analysis
1. Switch to "Batch Matrix" mode using the toggle
2. Upload multiple images (drag & drop or click)
3. Configure analysis options (Deep Scan, etc.)
4. Click "Process Pending Matrix"
5. Monitor progress and review results in the sortable table
6. Export results as CSV, PDF, or ZIP archive

## 📊 Understanding Results

### Classification Types
- **AI-generated**: Image created entirely by artificial intelligence
- **Real**: Authentic camera-captured image with no significant manipulation
- **Edited**: Genuine image that has been altered or manipulated
- **Mixed/Uncertain**: Conflicting or insufficient evidence for definitive classification

### Confidence Levels
- **High**: Multiple definitive pieces of evidence agree
- **Medium**: Some evidence present but could use more confirmation
- **Low**: Weak, ambiguous, or insufficient evidence

### Likelihood Scores
Each classification receives a percentage score (0-100%) indicating the relative likelihood. Scores are normalized to provide meaningful comparison.

## ⚙️ Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `NV_API_KEY` | NVIDIA API key for model access | (required) |
| `NV_BASE_URL` | NVIDIA API endpoint | `https://integrate.api.nvidia.com/v1` |
| `NV_MODEL` | AI model to use | `nvidia/nemotron-3-22b-instruct` |
| `PORT` | Server port | `3000` |

### Analysis Options
- **Deep Scan**: Performs three independent analysis passes for increased accuracy
- **Extract Style** (Experimental): Attempts to identify artistic style and medium
- **Metadata Analysis**: Automatic EXIF and software trace extraction

## 📄 Report Generation

ForensicTrace generates comprehensive PDF reports including:

1. **Header**: Case ID, timestamp, and branding
2. **Verdict Summary**: Classification, confidence, and likelihood scores
3. **Evidence Analysis**: Supporting evidence and detected issues
4. **Forensic Summary**: Analyst's findings in narrative form
5. **Final Verdict**: Clear, one-sentence conclusion
6. **Integrity Verification**: Hash values, timestamps, and chain of custody
7. **Watermarking**: Unique identifiers on every page

Reports are suitable for:
- Investigative documentation
- Expert testimony preparation
- Evidence preservation
- Legal discovery proceedings

## 🧪 Testing

Run the test suite:
```bash
npm run test
```

Current test coverage includes:
- PDF report generation
- Metadata extraction validation
- API endpoint security
- Input validation

## 🔒 Security Considerations

- **API Key Protection**: Never expose your NVIDIA API key client-side
- **Rate Limiting**: Analysis endpoint limited to 10 requests/minute
- **File Validation**: Strict MIME type and size checking (max 15MB)
- **Input Sanitization**: Protection against injection attacks
- **Timeout Handling**: Requests automatically abort after 120 seconds
- **Error Information**: Errors don't leak sensitive system information

## 📁 Project Structure

```
forensictrace/
├── src/
│   ├── App.tsx              # Main React application
│   ├── main.tsx             # React entry point
│   ├── components/          # Reusable UI components
│   │   ├── EvidenceList.tsx # Evidence display component
│   │   ├── MetadataPanel.tsx # EXIF data viewer
│   │   └── VerdictCard.tsx  # Results visualization
│   ├── utils/               # Utility functions
│   │   ├── pdfGenerator.ts  # Report creation
│   │   └── reportTemplates.ts # Report styling
│   └── index.css            # Tailwind CSS base
├── server.ts                # Express server with AI integration
├── index.html               # HTML template
├── package.json             # Dependencies and scripts
└── .env.example             # Environment template
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add: AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please ensure your code follows:
- Existing TypeScript conventions
- Component-based architecture
- Accessibility guidelines (WCAG 2.1)
- Security best practices

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

ForensicTrace is a research and investigative tool. While designed for accuracy, no automated system is infallible. Results should be interpreted by qualified professionals and corroborated with additional evidence when used in legal or formal proceedings.

The developers are not liable for any misinterpretation or misuse of the analysis results. Always maintain proper chain of custody for digital evidence intended for legal use.

## 🙏 Acknowledgments

- NVIDIA for the Nemotron model family
- Google AI Studio for deployment infrastructure
- Open-source community for Tailwind CSS, Lucide icons, and other libraries
- Digital forensics professionals whose expertise informed the analysis criteria

---

*ForensicTrace v2.4.0 - Signal Processed via Gemini Neural Core • 2026 Virtual Forensics Div.*