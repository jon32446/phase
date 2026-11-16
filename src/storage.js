import { localToday, parseDate } from './dates.js';
import { sameRecord, validateRecord } from './records.js';
import {
  containsDate, expandReviewSpan, overlaps, sameReview, sameReviews,
  startDates, startsInSpan, validateReview
} from './history.js';

export const DATABASE_NAME = 'phase-diary';
export const SCHEMA_VERSION = 2;

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
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('days', { keyPath: 'date' });
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (event.oldVersion < 2) db.createObjectStore('reviews', { keyPath: 'id' });
      request.transaction.objectStore('metadata').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
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
    return this.replaceDays([{ date, next, expected }]);
  }

  readState() {
    return new Promise((resolve, reject) => {
      let transaction;
      let days;
      let reviews;
      try {
        transaction = this.db.transaction(['days', 'reviews'], 'readonly');
        days = transaction.objectStore('days').getAll();
        reviews = transaction.objectStore('reviews').getAll();
      } catch (error) {
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => {
        try {
          resolve({ records: days.result.map(validateRecord), reviews: reviews.result.map(validateReview) });
        } catch (error) {
          reject(new Error('Saved history could not be read safely. No records were changed.', { cause: error }));
        }
      };
      transaction.onabort = () => reject(storageError(transaction.error));
    });
  }

  replaceDays(edits) {
    return this.commit({ edits });
  }

  saveReview(span, answer, expected) {
    return this.commit({ reviewEdit: { span, answer, expected } });
  }

  restore(change) {
    return this.commit({
      edits: change.changes.map((item) => ({
        date: item.date, next: item.previous, expected: item.next
      })),
      restore: change
    });
  }

  commit({ edits = [], reviewEdit, restore }) {
    const dates = new Set();
    const today = localToday();
    const changes = edits.map(({ date, next, expected }) => {
      parseDate(date);
      if (date > today) throw new RangeError('Future dates are view-only.');
      if (dates.has(date)) throw new TypeError('A batch cannot edit the same day twice.');
      dates.add(date);
      const record = next === null ? null : validateRecord(next);
      const previous = expected === null ? null : validateRecord(expected);
      if ((record && record.date !== date) || (previous && previous.date !== date)) {
        throw new TypeError('Record date does not match the edited day.');
      }
      return { date, previous, next: record, changed: !sameRecord(previous, record) };
    });
    return new Promise((resolve, reject) => {
      let transaction;
      let failure;
      let result;
      try {
        transaction = this.db.transaction(['days', 'reviews'], 'readwrite');
        const store = transaction.objectStore('days');
        const reviewStore = transaction.objectStore('reviews');
        const daysRequest = store.getAll();
        const reviewsRequest = reviewStore.getAll();
        reviewsRequest.onsuccess = () => {
          try {
            const days = new Map(daysRequest.result.map((record) => {
              const valid = validateRecord(record);
              return [valid.date, valid];
            }));
            const reviews = reviewsRequest.result.map(validateReview);
            const starts = startDates([...days.values()]);
            const stale = () => {
              throw Object.assign(new Error(
                'History changed elsewhere. Refresh the calendar records, or cancel and reopen the editor to review the latest history before editing.'
              ), { code: 'STALE_RECORD' });
            };
            for (const change of changes) {
              if (!sameRecord(days.get(change.date) ?? null, change.previous)) stale();
            }
            const changed = changes.filter((change) => change.changed);
            const startChanges = changed.filter((change) =>
              Boolean(change.previous?.periodStart) !== Boolean(change.next?.periodStart));
            const editedStarts = new Set(starts);
            for (const change of startChanges) {
              if (change.next?.periodStart) editedStarts.add(change.date);
              else editedStarts.delete(change.date);
            }
            const nextStarts = [...editedStarts].sort();
            const affected = (review, reviewChanges) => startChanges.some((change) => containsDate(review, change.date)) ||
              reviewChanges.some((change) => overlaps(review, change.previous ?? change.next));
            let nextReviews = [...reviews];
            if (restore) {
              if (!sameReviews(reviews.filter((review) => affected(review, restore.reviewChanges)), restore.reviewGuards)) stale();
              for (const guard of restore.startGuards) {
                if (JSON.stringify(startsInSpan(starts, guard)) !== JSON.stringify(guard.starts)) stale();
              }
              for (const change of restore.reviewChanges) {
                if (!sameReview(reviews.find((review) => review.id === change.id) ?? null, change.next)) stale();
                nextReviews = nextReviews.filter((review) => review.id !== change.id);
                if (change.previous) nextReviews.push(change.previous);
              }
            } else if (reviewEdit) {
              const { span, answer, expected } = reviewEdit;
              parseDate(span.start);
              parseDate(span.end);
              if (span.start >= span.end || span.end > today) throw new RangeError('Choose a past span through today.');
              const expanded = expandReviewSpan(span, reviews);
              if (expanded.start !== span.start || expanded.end !== span.end ||
                  JSON.stringify(startsInSpan(starts, span)) !==
                    JSON.stringify(startsInSpan(startDates(expected.records), span)) ||
                  !sameReviews(reviews.filter((review) => overlaps(review, span)),
                    expected.reviews.filter((review) => overlaps(review, span)))) stale();
              const replaced = reviews.filter((review) => overlaps(review, span));
              nextReviews = reviews.filter((review) => !overlaps(review, span));
              if (answer !== null) {
                nextReviews.push(validateReview({
                  id: `${span.start}/${span.end}`, ...span, answer,
                  starts: startsInSpan(starts, span), needsReview: false,
                  missingUnresolved: answer === 'missing' ||
                    (answer === 'unsure' && replaced.some((review) => review.missingUnresolved))
                }));
              }
            } else {
              nextReviews = reviews.map((review) =>
                startChanges.some((change) => containsDate(review, change.date)) ?
                  { ...review, needsReview: true, starts: startsInSpan(nextStarts, review) } : review);
            }
            const reviewChanges = [];
            for (const id of new Set([...reviews, ...nextReviews].map((review) => review.id))) {
              const previous = reviews.find((review) => review.id === id) ?? null;
              const next = nextReviews.find((review) => review.id === id) ?? null;
              if (!sameReview(previous, next)) reviewChanges.push({ id, previous, next });
            }
            for (const item of changed) {
              if (item.next) {
                store.put(item.next);
                days.set(item.date, item.next);
              } else {
                store.delete(item.date);
                days.delete(item.date);
              }
            }
            for (const change of reviewChanges) {
              if (change.next) reviewStore.put(change.next);
              else reviewStore.delete(change.id);
            }
            result = {
              changes, reviewChanges, records: [...days.values()], reviews: nextReviews,
              reviewGuards: nextReviews.filter((review) => affected(review, reviewChanges)),
              startGuards: reviewChanges.map((change) => {
                const span = change.previous ?? change.next;
                return { start: span.start, end: span.end, starts: startsInSpan(nextStarts, span) };
              })
            };
          } catch (error) {
            failure = error.code === 'STALE_RECORD' || error instanceof TypeError || error instanceof RangeError ?
              error : storageError(error);
            transaction.abort();
          }
        };
      } catch (error) {
        if (transaction) transaction.abort();
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? storageError(transaction.error));
    });
  }
}
