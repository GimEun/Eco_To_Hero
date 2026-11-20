import { validateSave } from './save-data.js';

const DATABASE = 'eco-to-hero';
const STORE = 'saves';
const SLOT = 'active';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('이 브라우저에서 로컬 저장을 사용할 수 없습니다.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    let finished = false;
    const fail = (error) => {
      finished = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('저장소 응답이 지연됩니다. 다른 게임 탭을 닫고 다시 시도해 주세요.')), 8000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onblocked = () => fail(new Error('다른 게임 탭이 저장소를 사용 중입니다. 해당 탭을 닫고 다시 시도해 주세요.'));
    request.onerror = () => fail(new Error('브라우저 저장소를 열지 못했습니다. 저장 권한을 확인해 주세요.'));
    request.onsuccess = () => {
      const db = request.result;
      if (finished) { db.close(); return; }
      finished = true;
      clearTimeout(timer);
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function readSavedGame() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(SLOT);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(new Error('저장된 구단을 읽지 못했습니다.'));
      transaction.onerror = () => { /* abort에서 실패를 처리한다. */ };
    });
  } finally { db.close(); }
}

// 확인 이후 다른 탭이 저장을 바꿨으면 같은 트랜잭션 안에서 교체를 거부한다.
export async function writeSavedGame(value, expectedRevision) {
  const data = validateSave(value);
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get(SLOT);
      const entry = { revision: crypto.randomUUID(), data };
      let conflict = false;
      request.onsuccess = () => {
        const previous = request.result;
        if ((previous?.revision ?? null) !== expectedRevision) {
          conflict = true;
          transaction.abort();
          return;
        }
        try { store.put(entry, SLOT); }
        catch { transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(entry);
      transaction.onabort = () => {
        const error = new Error(conflict
          ? '다른 탭에서 저장이 변경되었습니다. 다시 시도해 변경된 구단을 확인해 주세요.'
          : '저장하지 못했습니다. 저장 공간·권한을 확인하거나 백업을 내려받아 주세요.');
        if (conflict) error.name = 'SaveConflictError';
        reject(error);
      };
      transaction.onerror = () => { /* 요청 성공이 아닌 트랜잭션 완료로 저장을 판정한다. */ };
    });
  } finally { db.close(); }
}
