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
- No offline analysis (requires NVIDIA + HuggingFace API)

## Prompt Analysis (Experimental)
- Does NOT recover the original prompt
- Style keywords are guesses with low confidence
- Model fingerprinting only works for known model resolutions
