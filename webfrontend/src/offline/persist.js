import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createStore, del, get, set } from 'idb-keyval';

// Keeps the data both apps have loaded (today's poll, history, team, the
// console's dashboards and lists) in IndexedDB on this device, so screens
// still show their last known data after the app is closed and reopened
// offline. When the connection is back, every screen refetches as usual and
// the saved copy is replaced.
//
// Signing out removes that app's data (AuthContext) — the removal is saved
// here too, so the next person on a shared phone never sees it.

// Bump when the shape of saved API data changes in a way old screens can't
// read: everything saved under an older value is discarded on load.
export const CACHE_BUSTER = 'ft-cache-v1';
// Saved data older than this is discarded rather than shown.
export const CACHE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

let store;
try {
  store = createStore('flexitrack', 'query-cache');
} catch {
  store = undefined; // IndexedDB unavailable — the app still works, unsaved
}

// IndexedDB can be blocked (private mode, storage settings) or full: saving
// then quietly stops, it never breaks the app.
const storage = {
  getItem: async (key) => {
    try {
      return store ? (await get(key, store)) ?? null : null;
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      if (store) await set(key, value, store);
    } catch {
      // ignore
    }
  },
  removeItem: async (key) => {
    try {
      if (store) await del(key, store);
    } catch {
      // ignore
    }
  },
};

export const persister = createAsyncStoragePersister({
  storage,
  key: 'flexitrack-query-cache',
  throttleTime: 400,
});

export const persistOptions = {
  persister,
  buster: CACHE_BUSTER,
  maxAge: CACHE_MAX_AGE,
  dehydrateOptions: {
    // Only finished, successful data — never errors or in-flight requests.
    shouldDehydrateQuery: (query) => query.state.status === 'success',
    shouldDehydrateMutation: () => false,
  },
};
