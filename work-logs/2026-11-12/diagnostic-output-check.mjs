import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('명시 출력 폴더의 임시 파일 교체만 재시도하고 다른 대상·오류는 즉시 전달한다', async () => {
  const oldRename = fs.renameSync, oldDirectory = process.env.DIAGNOSTIC_OUTPUT_DIR;
  const directory = path.resolve('work-logs/2026-11-12/mock-output');
  process.env.DIAGNOSTIC_OUTPUT_DIR = directory;
  let count = 0, mode = 'retry';
  fs.renameSync = () => {
    count++;
    if (mode === 'retry' && count <= 2) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    if (mode === 'fatal') throw Object.assign(new Error('fatal'), { code: 'EIO' });
    if (mode === 'bypass') throw Object.assign(new Error('bypass'), { code: 'EPERM' });
  };
  try {
    await import('./diagnostic-output-retry.mjs');
    fs.renameSync(`${directory}/a.json.tmp`, `${directory}/a.json`); assert.equal(count, 3);
    count = 0; mode = 'fatal';
    assert.throws(() => fs.renameSync(`${directory}/a.json.tmp`, `${directory}/a.json`), /fatal/); assert.equal(count, 1);
    for (const [from, to] of [['outside.json.tmp', 'outside.json'], [`${directory}/a.json.tmp`, `${directory}/b.json`]]) {
      count = 0; mode = 'bypass'; assert.throws(() => fs.renameSync(from, to), /bypass/); assert.equal(count, 1);
    }
  } finally {
    fs.renameSync = oldRename;
    if (oldDirectory === undefined) delete process.env.DIAGNOSTIC_OUTPUT_DIR; else process.env.DIAGNOSTIC_OUTPUT_DIR = oldDirectory;
  }
});

test('출력 폴더가 작업 로그 밖이면 파일 작업 전 거부한다', () => {
  const child = spawnSync(process.execPath, ['--import', './work-logs/2026-11-12/diagnostic-output-retry.mjs', '--input-type=module', '-e', ''], {
    env: { ...process.env, DIAGNOSTIC_OUTPUT_DIR: path.resolve('..') }, encoding: 'utf8',
  });
  assert.notEqual(child.status, 0); assert.match(child.stderr, /AssertionError/);
});
