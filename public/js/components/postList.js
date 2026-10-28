import { h } from '../dom.js';
import { postSkeleton, postSkeletons, errorState } from '../ui.js';
import { postCard } from './postCard.js';

/**
 * Infinite, cursor-paginated list of post cards.
 * `load(cursor)` must resolve to `{ posts, nextCursor }`.
 */
export function postList({ load, empty }) {
  const root = h('div', { class: 'view' });
  const items = h('div', { class: 'view' });
  const sentinel = h('div', { class: 'load-more', 'aria-hidden': 'true' });
  let cursor = null;
  let done = false;
  let loading = false;
  const seen = new Set();

  const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more(), { rootMargin: '600px 0px' });

  function removeEmpty() {
    root.querySelector('.empty')?.remove();
  }

  async function more() {
    if (loading || done) return;
    loading = true;
    sentinel.replaceChildren(postSkeleton());
    try {
      const res = await load(cursor);
      res.posts.filter((p) => !seen.has(p.id)).forEach((p) => {
        seen.add(p.id);
        items.append(postCard(p, { onDeleted: forget }));
      });
      cursor = res.nextCursor;
      done = !cursor;
      sentinel.replaceChildren();
      if (done) {
        observer.disconnect();
        if (!seen.size) root.insertBefore(empty(), sentinel);
        else sentinel.replaceChildren(h('p', { class: 'end-of-feed' }, 'You’re all caught up ✨'));
      }
    } catch (err) {
      observer.disconnect();
      sentinel.replaceChildren(errorState(err, () => {
        sentinel.replaceChildren();
        observer.observe(sentinel);
        more();
      }));
    } finally {
      loading = false;
    }
  }

  function forget(id) {
    seen.delete(id);
    if (!seen.size && done) setTimeout(() => !seen.size && !root.querySelector('.empty') && root.insertBefore(empty(), sentinel), 400);
  }

  root.append(items, sentinel);

  // Initial skeleton, replaced on first page.
  const initial = postSkeletons(3);
  items.append(initial);
  load(null)
    .then((res) => {
      initial.remove();
      res.posts.forEach((p) => {
        seen.add(p.id);
        items.append(postCard(p, { onDeleted: forget }));
      });
      cursor = res.nextCursor;
      done = !cursor;
      if (!seen.size) root.insertBefore(empty(), sentinel);
      else if (done) sentinel.replaceChildren(h('p', { class: 'end-of-feed' }, 'You’re all caught up ✨'));
      else observer.observe(sentinel);
    })
    .catch((err) => {
      initial.remove();
      items.append(errorState(err, () => root.replaceWith(postList({ load, empty }))));
    });

  return {
    el: root,
    prepend(post) {
      if (seen.has(post.id)) return;
      seen.add(post.id);
      removeEmpty();
      const card = postCard(post, { onDeleted: forget });
      card.classList.add('is-new');
      items.prepend(card);
    },
    has: (id) => seen.has(id),
    destroy: () => observer.disconnect(),
  };
}
