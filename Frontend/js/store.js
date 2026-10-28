/** Minimal reactive store: components subscribe to the keys they care about. */
const state = {
  user: null,
  unread: 0,
};
const listeners = new Map();

export const store = {
  get: (key) => state[key],

  set(key, value) {
    state[key] = value;
    (listeners.get(key) || []).forEach((fn) => fn(value));
  },

  patchUser(patch) {
    if (!state.user) return;
    store.set('user', { ...state.user, ...patch });
  },

  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  },
};

/**
 * Cross-component events (e.g. a post edited in one card should update every
 * other card showing that post, or the follow button in the sidebar should
 * sync with the one on the profile page).
 */
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const listen = (type, fn) => {
  const handler = (e) => fn(e.detail);
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
};
