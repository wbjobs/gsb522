import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { WORKER_SOURCE } from '../src/platform/browser/worker-source.js';

// Evaluate the exact source string we ship to browsers inside a Node worker
// thread, giving us high confidence the Blob-URL worker behaves correctly.
test('shipped worker source computes contrast ratios and bucket averages', async () => {
  const code = `
    const self = {};
    const { parentPort } = require('node:worker_threads');
    ${WORKER_SOURCE}
    parentPort.on('message', (msg) => {
      self.postMessage = (payload) => parentPort.postMessage(payload);
      self.onmessage({ data: msg });
    });
  `;
  const worker = new Worker(code, { eval: true });
  const result = await new Promise((resolve, reject) => {
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.postMessage({
      id: 't1',
      items: [
        { type: 'contrast', fgArr: [255, 255, 255], bgArr: [0, 0, 0] },
        { type: 'contrast', fgArr: [119, 119, 119], bgArr: [255, 255, 255] },
        { type: 'average', data: [10, 20, 30, 20, 40, 60] }
      ]
    });
  });
  await worker.terminate();
  assert.equal(result.id, 't1');
  assert.ok(Math.abs(result.payload[0].ratio - 21) < 0.01, 'black/white = 21');
  assert.ok(Math.abs(result.payload[1].ratio - 4.48) < 0.03, '#777/white = 4.48');
  assert.deepEqual(result.payload[2].color, [15, 30, 45]);
});
