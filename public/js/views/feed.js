import { h, icon } from '../dom.js';
import { api } from '../api.js';
import { store, listen } from '../store.js';
import { emptyState } from '../ui.js';
import { navigate } from '../router.js';
import { composer } from '../components/composer.js';
import { postList } from '../components/postList.js';

function tabs(active) {
  const items = [
    { key: 'foryou', label: 'For You', href: '/' },
    { key: 'following', label: 'Following', href: '/following' },
  ];
  const indicator = h('span', { class: 'tab-indicator', 'aria-hidden': 'true' });
  const el = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    indicator,
    items.map((t) =>
      h(
        'button',
        {
          class: `tab${t.key === active ? ' active' : ''}`,
          role: 'tab',
          'aria-selected': String(t.key === active),
          onclick: () => navigate(t.href),
        },
        t.label
      )
    )
  );
  // Slide the gradient pill under the active tab.
  requestAnimationFrame(() => {
    const btn = el.querySelector('.tab.active');
    if (!btn) return;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
  });
  return el;
}

export function feedView(mode) {
  return (params, ctx) => {
    const me = store.get('user');
    const view = h('div', { class: 'view' });
    let pending = 0;
    let list;

    const pill = h('button', { class: 'new-posts-pill', type: 'button', hidden: true }, icon('arrowUp', 'icon-sm'), h('span'));

    const empty = () =>
      mode === 'following'
        ? emptyState({
            iconName: 'users',
            title: 'Your feed is quiet',
            text: 'Follow people to see their posts here, or share your first moment above.',
            action: h('a', { class: 'btn btn-primary', href: '#/' }, icon('compass', 'icon-sm'), 'Discover posts'),
          })
        : emptyState({ iconName: 'sparkles', title: 'Nothing here yet', text: 'Be the first to post something!' });

    function mountList() {
      list?.destroy();
      list = postList({ load: (cursor) => api.feed(mode, cursor), empty });
      const old = view.querySelector('.feed-list');
      list.el.classList.add('feed-list');
      if (old) old.replaceWith(list.el);
      else view.append(list.el);
    }

    pill.addEventListener('click', () => {
      pending = 0;
      pill.hidden = true;
      mountList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    view.append(tabs(mode), composer(), pill);
    mountList();

    ctx.onLeave(() => list?.destroy());
    ctx.onLeave(listen('post:created', (post) => list.prepend(post)));
    ctx.onLeave(
      listen('rt:post', ({ id, authorId, scope }) => {
        if (authorId === me.id || list.has(id) || scope !== mode) return;
        pending += 1;
        pill.hidden = false;
        pill.lastChild.textContent = `${pending} new post${pending > 1 ? 's' : ''}`;
      })
    );
    return view;
  };
}
