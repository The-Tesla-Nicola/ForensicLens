# ForensicLens Accuracy Baseline

Date: Pending — run `node test-accuracy.js` with a populated test set
Test images: Required — populate `test-images/real/`, `test-images/ai/`, `test-images/edited/`

## Results

| Category | Correct | Total | Accuracy |
|----------|---------|-------|----------|
| Real | - | - | - |
| AI-generated | - | - | - |
| Edited | - | - | - |
| **Total** | **-** | **-** | **-** |

## Known failure cases
- Overly dark images (low light): potential false negatives
- Midjourney v6 artistic style: potential false positives
- Images under 200px: unreliable

## Next improvement target
- Increase test set to 50 images
- Refine ELA thresholds
