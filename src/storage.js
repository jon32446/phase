import { localToday, parseDate } from './dates.js';
import { sameRecord, validateRecord } from './records.js';

export const DATABASE_NAME = 'phase-diary';
export const SCHEMA_VERSION = 1;

function storageError(error) {
  if (error?.name === 'QuotaExceededError') {
    return new Error('Browser storage is full. Your change was not saved.', { cause: error });
  }
  return new Error('Browser storage failed. Your change was not saved. Keep this editor open and try again.', { cause: error });
}

export function openStorage(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error('Browser storage is unavailable. Records cannot be loaded or saved.'));
      return;
    }
    let request;
    try {
      request = factory.open(DATABASE_NAME, SCHEMA_VERSION);
    } catch (error) {
      reject(storageError(error));
      return;
    }
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Another tab is preventing storage from opening. Close other Phase tabs and reload.'));
    };
    request.onerror = () => reject(storageError(request.error));
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('days', { keyPath: 'date' });
      db.createObjectStore('metadata', { keyPath: 'key' })
        .put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(new DiaryStorage(db));
    };
  });
}

class DiaryStorage {
  constructor(db) {
    this.db = db;
  }

  read(date) {
    return new Promise((resolve, reject) => {
      let transaction;
      let request;
      try {
        transaction = this.db.transaction('days', 'readonly');
        const store = transaction.objectStore('days');
        request = date ? store.get(date) : store.getAll();
      } catch (error) {
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => {
        try {
          resolve(date ? (request.result ? validateRecord(request.result) : null) :
            request.result.map(validateRecord));
        } catch (error) {
          reject(new Error('Saved records could not be read safely. No records were changed.', { cause: error }));
        }
      };
      transaction.onabort = () => reject(storageError(transaction.error));
    });
  }

  replaceDay(date, next, expected) {
    parseDate(date);
    if (date > localToday()) throw new RangeError('Future dates are view-only.');
    const record = next === null ? null : validateRecord(next);
    if (record && record.date !== date) throw new TypeError('Record date does not match the edited day.');
    return new Promise((resolve, reject) => {
      let transaction;
      let previous;
      let failure;
      try {
        transaction = this.db.transaction('days', 'readwrite');
        const store = transaction.objectStore('days');
        const request = store.get(date);
        request.onsuccess = () => {
          previous = request.result ?? null;
          if (!sameRecord(previous, expected)) {
            failure = new Error('This day changed elsewhere. Cancel and reopen it to review the latest record before editing.');
            transaction.abort();
            return;
          }
          try {
            if (!sameRecord(previous, record)) {
              if (record) store.put(record);
              else store.delete(date);
            }
          } catch (error) {
            failure = storageError(error);
            transaction.abort();
          }
        };
      } catch (error) {
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => resolve({
        date, previous, next: record, changed: !sameRecord(previous, record)
      });
      transaction.onabort = () => reject(failure ?? storageError(transaction.error));
    });
  }
}
