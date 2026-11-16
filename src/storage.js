import { localToday, parseDate } from './dates.js';
import { sameRecord, validateRecord } from './records.js';
import {
  containsDate, expandReviewSpan, overlaps, sameReview, sameReviews,
  startDates, startsInSpan, validateReview
} from './history.js';
import { deriveInsights, sameDismissal, validateDismissal } from './predictions.js';
import { sameState, validateState } from './backup.js';

export const DATABASE_NAME = 'phase-diary';
export const SCHEMA_VERSION = 3;

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
      if (event.oldVersion < 3) db.createObjectStore('dismissals', { keyPath: 'id' });
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
      let dismissals;
      let token;
      try {
        transaction = this.db.transaction(['days', 'reviews', 'dismissals', 'metadata'], 'readonly');
        days = transaction.objectStore('days').getAll();
        reviews = transaction.objectStore('reviews').getAll();
        dismissals = transaction.objectStore('dismissals').getAll();
        token = transaction.objectStore('metadata').get('resetToken');
      } catch (error) {
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => {
        try {
          this.resetToken = token.result?.value ?? null;
          resolve({
            records: days.result.map(validateRecord), reviews: reviews.result.map(validateReview),
            dismissals: dismissals.result.map(validateDismissal)
          });
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

  replaceState(state, expected) {
    return this.replaceAll(validateState(state), expected, false);
  }

  deleteAll(expected) {
    return this.replaceAll({ records: [], reviews: [], dismissals: [] }, expected, true);
  }

  replaceAll(state, expected, deleting) {
    return new Promise((resolve, reject) => {
      let transaction;
      let failure;
      const expectedToken = this.resetToken;
      const resetToken = globalThis.crypto.randomUUID();
      try {
        const stores = deleting ? [...this.db.objectStoreNames] : ['days', 'reviews', 'dismissals', 'metadata'];
        transaction = this.db.transaction(stores, 'readwrite');
        const token = transaction.objectStore('metadata').get('resetToken');
        const days = transaction.objectStore('days').getAll();
        const reviews = transaction.objectStore('reviews').getAll();
        const dismissals = transaction.objectStore('dismissals').getAll();
        dismissals.onsuccess = () => {
          try {
            if ((expectedToken !== undefined && expectedToken !== (token.result?.value ?? null)) ||
                !sameState({ records: days.result, reviews: reviews.result, dismissals: dismissals.result }, expected)) {
              throw Object.assign(new Error(
                'History changed elsewhere. Cancel and open a fresh preview before trying again.'
              ), { code: 'STALE_RECORD' });
            }
            for (const name of stores) {
              if (deleting || name !== 'metadata') transaction.objectStore(name).clear();
            }
            for (const record of state.records) transaction.objectStore('days').put(record);
            for (const review of state.reviews) transaction.objectStore('reviews').put(review);
            for (const dismissal of state.dismissals) transaction.objectStore('dismissals').put(dismissal);
            if (deleting) transaction.objectStore('metadata').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
            transaction.objectStore('metadata').put({ key: 'resetToken', value: resetToken });
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      } catch (error) {
        if (transaction) transaction.abort();
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => {
        this.resetToken = resetToken;
        resolve(state);
      };
      transaction.onabort = () => reject(failure?.code === 'STALE_RECORD' ? failure : new Error(
        'Browser storage failed. No data was replaced or deleted. Try again.', { cause: failure ?? transaction.error }
      ));
    });
  }

  saveReview(span, answer, expected) {
    return this.commit({ reviewEdit: { span, answer, expected } });
  }

  dismissCheckin(check) {
    return this.commit({ dismissCheck: validateDismissal(check) });
  }

  restore(change) {
    return this.commit({
      edits: change.changes.map((item) => ({
        date: item.date, next: item.previous, expected: item.next
      })),
      restore: change
    });
  }

  commit({ edits = [], reviewEdit, restore, dismissCheck }) {
    const expectedToken = restore ? restore.resetToken : this.resetToken;
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
        transaction = this.db.transaction(['days', 'reviews', 'dismissals', 'metadata'], 'readwrite');
        const token = transaction.objectStore('metadata').get('resetToken');
        const store = transaction.objectStore('days');
        const reviewStore = transaction.objectStore('reviews');
        const daysRequest = store.getAll();
        const reviewsRequest = reviewStore.getAll();
        const dismissalStore = transaction.objectStore('dismissals');
        const dismissalsRequest = dismissalStore.getAll();
        dismissalsRequest.onsuccess = () => {
          try {
            const resetToken = token.result?.value ?? null;
            if (expectedToken !== undefined && expectedToken !== resetToken) {
              throw Object.assign(new Error(
                'The diary was replaced or deleted in another tab. Reload before editing. Old edits cannot be restored.'
              ), { code: 'DIARY_RESET' });
            }
            const days = new Map(daysRequest.result.map((record) => {
              const valid = validateRecord(record);
              return [valid.date, valid];
            }));
            const reviews = reviewsRequest.result.map(validateReview);
            const dismissals = dismissalsRequest.result.map(validateDismissal);
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
            const currentContext = (dismissal) =>
              JSON.stringify(dismissal.starts) === JSON.stringify(startsInSpan(nextStarts, dismissal)) &&
              (dismissal.anchor === null || dismissal.anchor === nextStarts.at(-1));
            let nextDismissals = dismissals.filter((dismissal) => currentContext(dismissal) &&
              !reviewChanges.some((change) => overlaps(dismissal, change.previous ?? change.next)));
            if (restore) {
              for (const change of restore.dismissalChanges) {
                if (!change.previous || !currentContext(change.previous)) continue;
                nextDismissals = nextDismissals.filter((dismissal) => dismissal.id !== change.id);
                nextDismissals.push(change.previous);
              }
            }
            if (dismissCheck) {
              const current = deriveInsights([...days.values()], reviews, dismissals, today).checkins
                .find((check) => check.id === dismissCheck.id);
              if (!current || !sameDismissal(validateDismissal(current), dismissCheck)) stale();
              nextDismissals = nextDismissals.filter((dismissal) => dismissal.id !== dismissCheck.id);
              nextDismissals.push(dismissCheck);
            }
            const dismissalChanges = [];
            for (const id of new Set([...dismissals, ...nextDismissals].map((dismissal) => dismissal.id))) {
              const previous = dismissals.find((dismissal) => dismissal.id === id) ?? null;
              const next = nextDismissals.find((dismissal) => dismissal.id === id) ?? null;
              if (!sameDismissal(previous, next)) dismissalChanges.push({ id, previous, next });
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
            for (const change of dismissalChanges) {
              if (change.next) dismissalStore.put(change.next);
              else dismissalStore.delete(change.id);
            }
            result = {
              resetToken,
              changes, reviewChanges, dismissalChanges,
              records: [...days.values()], reviews: nextReviews, dismissals: nextDismissals,
              reviewGuards: nextReviews.filter((review) => affected(review, reviewChanges)),
              startGuards: reviewChanges.map((change) => {
                const span = change.previous ?? change.next;
                return { start: span.start, end: span.end, starts: startsInSpan(nextStarts, span) };
              })
            };
          } catch (error) {
            failure = ['STALE_RECORD', 'DIARY_RESET'].includes(error.code) || error instanceof TypeError || error instanceof RangeError ?
              error : storageError(error);
            transaction.abort();
          }
        };
      } catch (error) {
        if (transaction) transaction.abort();
        reject(storageError(error));
        return;
      }
      transaction.oncomplete = () => {
        this.resetToken = result.resetToken;
        resolve(result);
      };
      transaction.onabort = () => reject(failure ?? storageError(transaction.error));
    });
  }
}
