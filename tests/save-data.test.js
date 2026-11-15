import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { parseBackup, validateSave, MAX_BACKUP_BYTES, SCHEMA_VERSION } from '../src/storage/save-data.js';

const valid = () => validateSave({ format: 'eco-to-hero', schemaVersion: 1, savedAt: '2026-11-07T00:00:00.000Z', club: createClub('새벽 게이밍').club });

test('한글 구단·선수 데이터는 JSON 왕복 후 동일하고 원본과 분리된다', () => {
  const original = valid();
  const restored = parseBackup(JSON.stringify(original));
  assert.deepEqual(restored, original);
  restored.club.players[0].aim = 1;
  assert.notEqual(original.club.players[0].aim, 1);
});

test('손상 JSON, 다른 게임, 지원 범위 밖 버전, 초과 용량을 거부한다', () => {
  assert.throws(() => parseBackup('{broken'), /JSON/);
  for (const schemaVersion of [0, SCHEMA_VERSION + 1, '1', null]) {
    assert.throws(() => validateSave({ ...valid(), schemaVersion }), /버전/);
  }
  assert.throws(() => validateSave({ ...valid(), format: 'other' }));
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /32MB/);
  // 글자 수가 아니라 실제 UTF-8 바이트 수로 검사한다.
  assert.throws(() => parseBackup('가'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3))), /32MB/);
});

test('잘못된 구단 자금·종목·리그·빈 이름과 날짜를 거부한다', () => {
  const changes = [
    { balance: -1 }, { balance: 1.5 }, { balance: Number.MAX_SAFE_INTEGER + 1 },
    { balance: '15000' }, { name: '   ' }, { name: 'a'.repeat(25) },
    { league: '전세계 리그' }, { discipline: '배틀로얄' },
  ];
  for (const change of changes) {
    const data = valid();
    Object.assign(data.club, change);
    assert.throws(() => validateSave(data));
  }
  assert.throws(() => validateSave({ ...valid(), savedAt: 'invalid' }));
  for (const club of [null, [], 'club']) assert.throws(() => validateSave({ ...valid(), club }));
});

test('명단 수, ID 중복, 능력 범위·타입, 잘못된 선수 필드를 거부한다', () => {
  for (const value of [0, 100, 1.1, '50', null]) {
    for (const field of ['aim', 'intelligence', 'stamina']) {
      const data = valid();
      data.club.players[0][field] = value;
      assert.throws(() => validateSave(data));
    }
  }
  const duplicate = valid();
  duplicate.club.players[1].id = duplicate.club.players[0].id;
  assert.throws(() => validateSave(duplicate), /중복/);
  const fewer = valid();
  fewer.club.players.pop();
  assert.throws(() => validateSave(fewer), /5명/);
  for (const change of [{ name: '' }, { nickname: 'a'.repeat(25) }, { id: '' }]) {
    const data = valid();
    Object.assign(data.club.players[0], change);
    assert.throws(() => validateSave(data));
  }
});

test('가져오기 실패는 입력 상태를 변경하지 않고 불필요한 필드를 복원하지 않는다', () => {
  const data = valid();
  const before = structuredClone(data);
  data.club.players[0].aim = 100;
  assert.throws(() => validateSave(data));
  assert.equal(data.club.players[0].aim, 100);
  assert.equal(before.club.players[0].aim, 48);
  const json = JSON.parse(JSON.stringify(before));
  json.club.extra = { unexpected: true };
  Object.defineProperty(json.club, '__proto__', { value: { polluted: true }, enumerable: true });
  const clean = parseBackup(JSON.stringify(json));
  assert.equal(Object.hasOwn(clean.club, '__proto__'), false);
  assert.equal(Object.hasOwn(clean.club, 'extra'), false);
  assert.equal({}.polluted, undefined);
});
