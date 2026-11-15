import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('결과 저장 재시도는 지정 폴더의 일시적 오류만 재시도하고 실제 파일은 건드리지 않는다', async () => {
  const original = fs.renameSync;
  let calls = 0, mode = 'temporary';
  fs.renameSync = () => {
    calls++;
    if (mode === 'temporary' && calls <= 2) throw Object.assign(new Error('temporary'), { code: 'EPERM' });
    if (mode === 'permanent') throw Object.assign(new Error('permanent'), { code: 'EIO' });
    if (mode === 'outside') throw Object.assign(new Error('outside'), { code: 'EPERM' });
  };
  try {
    await import('./risk-io-retry.mjs');
    const directory = path.resolve('work-logs/2026-11-12/independent44-research-retry');
    fs.renameSync(`${directory}/check.json.tmp`, `${directory}/check.json`);
    assert.equal(calls, 3);
    mode = 'permanent'; calls = 0;
    assert.throws(() => fs.renameSync(`${directory}/check.json.tmp`, `${directory}/check.json`), /permanent/);
    assert.equal(calls, 1);
    mode = 'outside'; calls = 0;
    assert.throws(() => fs.renameSync('outside.json.tmp', 'outside.json'), /outside/);
    assert.equal(calls, 1);
  } finally { fs.renameSync = original; }
});
