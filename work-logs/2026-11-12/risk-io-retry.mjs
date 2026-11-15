import fs from 'node:fs';
import path from 'node:path';
// Retry transient Windows result-file replacement failures only. Simulation
// code, RNG, source files, and stored results are never modified by this hook.
const rename = fs.renameSync;
const directory = path.resolve('work-logs/2026-11-12/independent44-research-retry');
const pause = new Int32Array(new SharedArrayBuffer(4));
fs.renameSync = function (from, to) {
  if (path.dirname(path.resolve(from)) !== directory || path.dirname(path.resolve(to)) !== directory
    || !String(from).endsWith('.json.tmp') || !String(to).endsWith('.json')) return rename(from, to);
  for (let attempt = 0; ; attempt++) {
    try { return rename(from, to); }
    catch (error) {
      if (attempt >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      console.warn(JSON.stringify({ resultWriteRetry: attempt + 1, code: error.code }));
      Atomics.wait(pause, 0, 0, 100);
    }
  }
};
