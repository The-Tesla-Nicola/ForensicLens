// Run: node test-accuracy.js
// Sends images to the API and logs accuracy results

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
        try {
          const result = JSON.parse(body);
          results.push({
            file: path.basename(filePath),
            expected,
            got: result.classification,
            confidence: result.confidenceLevel,
            aiScore: result.aiLikelihood,
            realScore: result.realLikelihood,
            elaScore: result.elaScore,
            elaInterpretation: result.elaInterpretation,
            correct: result.classification === expected
          });
        } catch (e) {
          results.push({ file: path.basename(filePath), expected, error: body.substring(0, 100) });
        }
        resolve();
      });
    });
    req.on('error', (e) => {
      results.push({ file: path.basename(filePath), expected, error: e.message });
      resolve();
    });
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
      await testImage(path.join(dirPath, f), cat.expected);
    }
  }

  console.log('\n=== ACCURACY TEST RESULTS ===\n');
  results.forEach(r => {
    if (r.error) {
      console.log(`⚠ ${r.file}: ERROR - ${r.error}`);
    } else {
      const mark = r.correct ? 'PASS' : 'FAIL';
      console.log(`${mark} ${r.file}: expected=${r.expected} got=${r.got} (AI:${r.aiScore}% Real:${r.realScore}%)`);
    }
  });

  const valid = results.filter(r => !r.error);
  const correct = valid.filter(r => r.correct).length;
  console.log(`\nAccuracy: ${correct}/${valid.length} (${Math.round(correct/valid.length*100)}%)`);
  console.log(`Errors: ${results.length - valid.length}`);

  // Save results
  const outputPath = path.join(TEST_DIR, 'results');
  if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
  const timestamp = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(outputPath, `baseline_${timestamp}.json`), JSON.stringify(results, null, 2));
  console.log(`\nResults saved to test-images/results/baseline_${timestamp}.json`);
}

run().catch(console.error);
