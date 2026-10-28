import { $$ } from './dom.js';
import { store, emit } from './store.js';

/**
 * Server-Sent Events client. Applies live counters straight to any matching
 * post cards in the DOM and re-emits feed/activity events on the app bus.
 */
let source = null;

const cardsFor = (id) => $$(`[data-post-id="${CSS.escape(id)}"]`);

const handlers = {
  'post:stats': (d) => cardsFor(d.id).forEach((card) => card.applyStats?.(d)),
  'post:updated': (d) => cardsFor(d.id).forEach((card) => card.refresh?.()),
  'post:deleted': (d) => cardsFor(d.id).forEach((card) => card.removeAnimated?.()),
  'post:new': (d) => emit('rt:post', { ...d, scope: 'explore' }),
  'feed:new': (d) => emit('rt:post', { ...d, scope: 'following' }),
  'comment:new': (d) => cardsFor(d.postId).forEach((card) => card.onCommentEvent?.({ type: 'new', ...d })),
  'comment:deleted': (d) => cardsFor(d.postId).forEach((card) => card.onCommentEvent?.({ type: 'deleted', ...d })),
  notification: (d) => {
    const before = store.get('unread');
    store.set('unread', d.unread);
    if (d.unread > before) emit('rt:notification', d);
  },
};

export function connect(token) {
  disconnect();
  if (!('EventSource' in window)) return;
  source = new EventSource(`/api/stream?token=${encodeURIComponent(token || '')}`);
  for (const [event, fn] of Object.entries(handlers)) {
    source.addEventListener(event, (e) => {
      try {
        fn(JSON.parse(e.data));
      } catch {
        /* malformed event - ignore */
      }
    });
  }
}

export function disconnect() {
  source?.close();
  source = null;
}
