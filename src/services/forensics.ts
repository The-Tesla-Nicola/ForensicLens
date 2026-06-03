import sharp from 'sharp';

export interface ELAResult {
  score: number;
  heatmapBase64?: string;
  interpretation: 'uniform' | 'patchy' | 'suspicious';
}

export async function performELA(
  buffer: Buffer,
  originalMimeType: string
): Promise<ELAResult> {
  const resaved = await sharp(buffer)
    .jpeg({ quality: 85 })
    .toBuffer();

  const originalPixels = await sharp(buffer).raw().toBuffer();
  const resavedPixels = await sharp(resaved).raw().toBuffer();

  if (originalPixels.length !== resavedPixels.length) {
    return { score: 0, interpretation: 'uniform' };
  }

  let totalDiff = 0;
  let maxDiff = 0;
  const diffMap: number[] = [];

  for (let i = 0; i < originalPixels.length; i += 3) {
    const diff = Math.abs(originalPixels[i] - resavedPixels[i]) +
                 Math.abs(originalPixels[i + 1] - resavedPixels[i + 1]) +
                 Math.abs(originalPixels[i + 2] - resavedPixels[i + 2]);
    totalDiff += diff;
    maxDiff = Math.max(maxDiff, diff);
    diffMap.push(diff);
  }

  const avgDiff = totalDiff / (originalPixels.length / 3);

  const variance = diffMap.reduce((acc, val) => acc + (val - avgDiff) ** 2, 0) / diffMap.length;
  const stdDev = Math.sqrt(variance);

  const uniformityRatio = avgDiff > 0 ? stdDev / avgDiff : 0;

  let interpretation: 'uniform' | 'patchy' | 'suspicious';
  let score: number;

  if (uniformityRatio < 0.5) {
    interpretation = 'uniform';
    score = Math.min(30, avgDiff * 2);
  } else if (uniformityRatio < 1.0) {
    interpretation = 'suspicious';
    score = Math.min(70, 30 + avgDiff * 3);
  } else {
    interpretation = 'patchy';
    score = Math.min(95, 50 + avgDiff * 5);
  }

  return { score, interpretation };
}

export interface ModelFingerprint {
  likelyModels: Array<{ name: string; confidence: number }>;
  estimatedAspectRatio: string;
  resolutionPattern: string;
}

export function fingerprintModel(width: number, height: number): ModelFingerprint {
  const ratio = width / height;

  const MODEL_PATTERNS: Array<{
    name: string;
    check: (w: number, h: number) => boolean;
  }> = [
    { name: 'Midjourney v6', check: (w, h) => [1456, 1456, 1824, 1024, 2048].includes(w) && [816, 1456, 1024, 1824, 2048].includes(h) },
    { name: 'Midjourney v5', check: (w, h) => [1024, 1456].includes(w) && [1024, 816].includes(h) },
    { name: 'DALL-E 3', check: (w, h) => [1792, 1024].includes(w) && [1024, 1792].includes(h) },
    { name: 'Stable Diffusion XL', check: (w, h) => (w === 1024 && h === 1024) || (w === 1216 && h === 832) },
    { name: 'Stable Diffusion 1.5', check: (w, h) => (w === 512 && h === 512) || (w === 768 && h === 768) },
    { name: 'Adobe Firefly', check: (w, h) => w === 2048 && h === 2048 },
  ];

  const matches = MODEL_PATTERNS
    .filter(p => p.check(width, height))
    .map(p => ({ name: p.name, confidence: 70 }));

  if (matches.length === 0) {
    matches.push({ name: 'Unknown / Custom resolution', confidence: 50 });
  }

  return {
    likelyModels: matches,
    estimatedAspectRatio: ratio > 1 ? `${Math.round(ratio * 100)}:100` : `${Math.round((1 / ratio) * 100)}:100`,
    resolutionPattern: `${width}x${height}`,
  };
}
