import fs from 'fs';

const HF_KEY = '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';
const img = fs.readFileSync('./test-images/ai/OIP (3).webp');
const b64 = img.toString('base64');

const body = JSON.stringify({
  model: 'CohereLabs/aya-vision-32b:fastest',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Is this image a real photograph or AI-generated? Answer with ONLY a JSON object like {"label":"Real","confidence":0.95}' },
      { type: 'image_url', image_url: { url: `data:image/webp;base64,${b64}` } }
    ]
  }],
  stream: false
});

fetch('https://router.huggingface.co/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${HF_KEY}`, 'Content-Type': 'application/json' },
  body
}).then(r => r.json()).then(d => {
  console.log('Full response:', JSON.stringify(d).substring(0, 1000));
}).catch(e => console.log('FAIL:', e.message));
