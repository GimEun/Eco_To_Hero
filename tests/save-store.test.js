import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createSave } from '../src/storage/save-data.js';
import { readSavedGame, writeSavedGame } from '../src/storage/save-store.js';

// 저장 처리의 이벤트 순서와 중단 결과를 확인하기 위한 테스트용 API 경계.
// 실제 브라우저의 영속성·권한·용량은 사용자 확인에서 별도로 검증한다.
function installBoundary(context, previous = null) {
  const old = globalThis.indexedDB;
  context.after(() => { globalThis.indexedDB = old; });
  const state = { transaction: null, written: null, closed: 0 };
  const db = {
    close() { state.closed++; },
    transaction() {
      const transaction = {
        objectStore() {
          return {
            get() {
              const request = { result: previous };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
            put(value, key) { state.written = { value, key }; },
          };
        },
        abort() { queueMicrotask(() => transaction.onabort?.()); },
      };
      state.transaction = transaction;
      return transaction;
    },
  };
  globalThis.indexedDB = {
    open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  return state;
}

test('요청 성공만으로 저장 성공을 보고하지 않고 트랜잭션 완료를 기다린다', async (context) => {
  const state = installBoundary(context);
  let settled = false;
  const pending = writeSavedGame(createSave(createWorld(createClub('테스트 구단').club, 1)), null);
  pending.then(() => { settled = true; });
  await setImmediate();
  assert.equal(settled, false);
  assert.equal(state.written.key, 'active');
  state.transaction.oncomplete();
  const result = await pending;
  assert.equal(result.data.world.clubs[0].name, '테스트 구단');
  assert.equal(typeof result.revision, 'string');
  assert.equal(state.closed, 1);
});

test('다른 탭의 리비전 변경은 쓰기 전에 거부한다', async (context) => {
  const state = installBoundary(context, { revision: 'changed-in-other-tab' });
  await assert.rejects(writeSavedGame(createSave(createWorld(createClub('새 구단').club, 1)), 'old-revision'), { name: 'SaveConflictError' });
  assert.equal(state.written, null);
  assert.equal(state.closed, 1);
});

test('저장 요청 후 중단은 성공으로 처리하지 않는다', async (context) => {
  const state = installBoundary(context);
  const pending = writeSavedGame(createSave(createWorld(createClub('저장 실패').club, 1)), null);
  const rejected = assert.rejects(pending, /저장하지 못/);
  await setImmediate();
  state.transaction.onabort();
  await rejected;
  assert.equal(state.closed, 1);
});

test('빈 저장 슬롯을 읽고 트랜잭션 완료 후 연결을 닫는다', async (context) => {
  const state = installBoundary(context);
  const pending = readSavedGame();
  await setImmediate();
  state.transaction.oncomplete();
  assert.equal(await pending, null);
  assert.equal(state.closed, 1);
});

test('기존 슬롯을 읽는 동안 데이터를 쓰지 않는다', async (context) => {
  const entry = { revision: 'existing', data: createSave(createWorld(createClub('기존 구단').club, 1)) };
  const state = installBoundary(context, entry);
  const pending = readSavedGame();
  await setImmediate();
  state.transaction.oncomplete();
  assert.deepEqual(await pending, entry);
  assert.equal(state.written, null);
});

test('IndexedDB가 없으면 저장소 사용 불가를 알린다', async (context) => {
  const old = globalThis.indexedDB;
  context.after(() => { globalThis.indexedDB = old; });
  globalThis.indexedDB = undefined;
  await assert.rejects(readSavedGame(), /사용할 수 없/);
});
