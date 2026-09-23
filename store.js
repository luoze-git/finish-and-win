import { initialState, change } from './core.js';
const opened = new Promise((resolve, reject) => {
  const request = indexedDB.open('finish-and-win', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('state');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(Error('无法打开本地存储，请检查浏览器设置'));
  request.onblocked = () => reject(Error('请关闭此应用的其他标签页后重试'));
});
// 同一对象仓库的读写事务串行执行；多标签页也不会重复开奖或透支。
export async function transaction(action) {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', action ? 'readwrite' : 'readonly');
    const store = tx.objectStore('state');
    const request = store.get('current');
    let result, failure;
    request.onsuccess = () => {
      try {
        result = request.result ?? initialState();
        if (action) { result = change(result, action); store.put(result, 'current'); }
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure ?? Error('保存失败，本次操作未生效。请检查设备存储空间后重试'));
  });
}
