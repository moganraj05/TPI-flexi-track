import { useSyncExternalStore } from 'react';

// Poll answers given while offline. The worker taps "Yes, I'm in" / "Can't
// come" with no connection: the answer is kept here (localStorage, so it
// survives closing the app), shown as "waiting to send", and sent by
// <OutboxSync> as soon as the phone is back online. One entry per person per
// poll — answering again before it is sent just replaces it.
//
// The server still decides: an answer that arrives after the poll closed is
// refused, and the worker is told it couldn't be counted.

const KEY = 'flexitrack_outbox';
const EVENT = 'ft-outbox-change';

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let snapshot = read();

function write(list) {
  snapshot = list;
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked — the entry still lives in memory for this visit
  }
  window.dispatchEvent(new Event(EVENT));
}

// Another tab changed it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      snapshot = read();
      window.dispatchEvent(new Event(EVENT));
    }
  });
}

export function queueAnswer({ userId, pollId, answer, closesAt }) {
  const rest = snapshot.filter((e) => !(e.userId === userId && e.pollId === pollId));
  write([...rest, { userId, pollId, answer, closesAt: closesAt || null, queuedAt: new Date().toISOString() }]);
}

export function removeEntry(entry) {
  write(snapshot.filter((e) => !(e.userId === entry.userId && e.pollId === entry.pollId)));
}

// Signing out drops that person's unsent answers.
export function clearOutbox(userId) {
  write(userId ? snapshot.filter((e) => e.userId !== userId) : []);
}

export const outboxFor = (userId) => snapshot.filter((e) => e.userId === userId);

const subscribe = (onChange) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

// The signed-in person's unsent answers (re-renders when they change).
export function useOutbox(userId) {
  const all = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  return userId ? all.filter((e) => e.userId === userId) : [];
}

// Sends this person's waiting answers, oldest first. Stops at the first
// network problem (still offline / server unreachable) and keeps the rest
// for the next try. An answer the server refuses (poll closed, no longer
// assigned) is removed and reported, since sending it again can't succeed.
export async function flushOutbox(userId, { send, onSent, onRefused }) {
  const pending = outboxFor(userId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  for (const entry of pending) {
    try {
      const result = await send(entry);
      removeEntry(entry);
      onSent?.(entry, result);
    } catch (error) {
      const status = error?.status ?? 0;
      if (status === 0 || status === 401 || status >= 500 || status === 429) return; // try again later
      removeEntry(entry);
      onRefused?.(entry, error);
    }
  }
}
