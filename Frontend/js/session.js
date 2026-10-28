import { tokenStore } from './api.js';
import { store } from './store.js';
import { connect, disconnect } from './realtime.js';
import { navigate } from './router.js';

export function startSession({ token, user, unread = 0 }, { redirect = true } = {}) {
  tokenStore.set(token);
  store.set('unread', unread);
  store.set('user', user);
  connect(token);
  if (redirect) navigate('/');
}

export function endSession({ expired = false } = {}) {
  tokenStore.set(null);
  disconnect();
  store.set('user', null);
  store.set('unread', 0);
  navigate('/login');
  return expired;
}
