import type { StorageProvider } from './types';

const DB_VERSION = 1;
const STORE_NAME = 'kv';
const DB_NAME = 'fruloop';

export class IndexedDBStorageProvider implements StorageProvider {
  readonly type = 'indexedDB' as const;
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async save<T>(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? requestError(tx));
    });
  }

  async load<T>(key: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      tx.oncomplete = () => resolve((request.result as T) ?? null);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? request.error ?? new Error('IndexedDB read failed'));
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      tx.oncomplete = () => resolve(request.result as string[]);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? request.error ?? new Error('IndexedDB keys failed'));
    });
  }
}

function requestError(tx: IDBTransaction): Error {
  return tx.error ?? new Error('IndexedDB request failed');
}
