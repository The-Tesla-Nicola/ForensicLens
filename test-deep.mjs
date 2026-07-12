// Deep scan test: 3-pass ensemble voting
import fs from 'fs';
import path from 'path';
import http from 'http';

const TEST_DIR = './test-images';
const results = [];

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  return mimeTypes[ext] || 'image/jpeg';
}

function testImage(filePath, expected) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');

  return new Promise((resolve) => {
    const data = JSON.stringify({ imageBase64: base64, mimeType: getMimeType(filePath), deepScan: true });
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/analyze',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            console.log(`  API error: ${result.error}`);
            results.push({ file: path.basename(filePath), expected, error: result.error });
          } else {
            results.push({
              file: path.basename(filePath),
              expected,
              got: result.classification,
              confidence: result.confidenceLevel,
              aiScore: result.aiLikelihood,
              realScore: result.realLikelihood,
              editedScore: result.editedLikelihood,
              correct: result.classification === expected
            });
          }
        } catch (e) {
          results.push({ file: path.basename(filePath), expected, error: `Parse: ${body.substring(0, 100)}` });
        }
        resolve();
      });
    });
    req.on('error', (e) => {
      results.push({ file: path.basename(filePath), expected, error: e.message });
      resolve();
    });
    req.setTimeout(300000, () => { req.destroy(); results.push({ file: path.basename(filePath), expected, error: 'Timeout' }); resolve(); });
    req.write(data);
    req.end();
  });
}

async function run() {
  const categories = [
    { dir: 'real', expected: 'Real' },
    { dir: 'ai', expected: 'AI-generated' },
    { dir: 'edited', expected: 'Edited' },
  ];

  for (const cat of categories) {
    const dirPath = path.join(TEST_DIR, cat.dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter(f => /\.(jpg|png|webp)$/i.test(f));
    for (const f of files) {
      const start = Date.now();
      console.log(`Testing ${f}...`);
      await testImage(path.join(dirPath, f), cat.expected);
      const elapsed = Math.round((Date.now() - start) / 1000);
      const r = results[results.length - 1];
      if (r.error) {
        console.log(`  -> ERROR (${elapsed}s): ${r.error}`);
      } else {
        console.log(`  -> ${r.got} (AI:${r.aiScore}% Real:${r.realScore}% Ed:${r.editedScore}%) [${elapsed}s]`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n=== DEEP SCAN ACCURACY TEST RESULTS ===\n');
  results.forEach(r => {
    if (r.error) {
      console.log(`⚠ ${r.file}: ERROR - ${r.error}`);
    } else {
      const mark = r.correct ? 'PASS' : 'FAIL';
      console.log(`${mark} ${r.file}: expected=${r.expected} got=${r.got} (AI:${r.aiScore}% Real:${r.realScore}% Ed:${r.editedScore}%)`);
    }
  });

  const valid = results.filter(r => !r.error);
  const correct = valid.filter(r => r.correct).length;
  console.log(`\nAccuracy: ${correct}/${valid.length} (${Math.round(correct/valid.length*100)}%)`);
  console.log(`Errors: ${results.length - valid.length}`);
}

run().catch(console.error);
