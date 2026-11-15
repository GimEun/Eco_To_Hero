import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
// I/O only; use one explicitly scoped output directory per diagnostic process.
assert.ok(process.env.DIAGNOSTIC_OUTPUT_DIR, 'An explicit diagnostic output directory is required');
const directory = path.resolve(process.env.DIAGNOSTIC_OUTPUT_DIR);
const relative = path.relative(path.resolve('work-logs/2026-11-12'), directory);
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
const nativeRename = fs.renameSync;
const pause = new Int32Array(new SharedArrayBuffer(4));
let retries = 0;
fs.renameSync = function (from, to) {
  if (typeof from !== 'string' || typeof to !== 'string'
    || path.dirname(path.resolve(from)) !== directory || path.dirname(path.resolve(to)) !== directory
    || !from.endsWith('.json.tmp') || path.resolve(from) !== `${path.resolve(to)}.tmp`) return nativeRename(from, to);
  for (let attempt = 0; ; attempt++) {
    try { return nativeRename(from, to); }
    catch (error) {
      if (attempt >= 50 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      retries++;
      console.warn(JSON.stringify({ outputRetry: attempt + 1, directory: relative, code: error.code }));
      Atomics.wait(pause, 0, 0, 100);
    }
  }
};
process.on('exit', () => { if (retries) console.warn(JSON.stringify({ totalOutputRetries: retries, directory: relative })); });
