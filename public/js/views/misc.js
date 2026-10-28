import { h, icon, debounce, compact } from '../dom.js';
import { api, tokenStore } from '../api.js';
import { store } from '../store.js';
import { postSkeleton, emptyState, errorState, userRowSkeleton, field, setLoading, showFieldErrors, toast, confirmDialog, passwordChecklist, passwordMeetsRules } from '../ui.js';
import { navigate } from '../router.js';
import { postCard } from '../components/postCard.js';
import { userRow } from '../components/userRow.js';
import { postList } from '../components/postList.js';
import { activityItem, markAllRead } from '../components/notifications.js';
import { endSession } from '../session.js';
import { applyTheme, currentTheme } from '../theme.js';

function backHeader(title) {
  return h(
    'div',
    { class: 'view-header', style: { justifyContent: 'flex-start' } },
    h('button', { class: 'btn-icon', 'aria-label': 'Back', onclick: () => (history.length > 1 ? history.back() : navigate('/')) }, icon('arrowLeft')),
    h('h1', { class: 'view-title' }, title)
  );
}

/* Single post -------------------------------------------------------------- */
export function postView({ id }, ctx) {
  const view = h('div', { class: 'view' }, backHeader('Post'), postSkeleton());
  api
    .post(id)
    .then(({ post }) => {
      if (!ctx.isCurrent()) return;
      view.lastChild.replaceWith(postCard(post, { expanded: true, onDeleted: () => setTimeout(() => navigate('/'), 400) }));
    })
    .catch((err) => {
      view.lastChild.replaceWith(
        err.status === 404
          ? emptyState({ iconName: 'alert', title: 'Post not found', text: 'It may have been deleted.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to feed') })
          : errorState(err)
      );
    });
  return view;
}

/* Activity ----------------------------------------------------------------- */
export function activityView(params, ctx) {
  const list = h('div', { class: 'card', style: { overflow: 'hidden' } }, userRowSkeleton(), userRowSkeleton(), userRowSkeleton(), userRowSkeleton());
  const view = h('div', { class: 'view' }, h('div', { class: 'view-header' }, h('h1', { class: 'view-title' }, 'Activity')), list);
  let cursor = null;
  let count = 0;

  async function load() {
    try {
      const res = await api.notifications(cursor);
      if (!ctx.isCurrent()) return;
      if (!cursor) list.replaceChildren();
      list.querySelector('.load-more')?.remove();
      res.notifications.forEach((n) => list.append(activityItem(n, count++)));
      if (!count) {
        list.replaceWith(emptyState({ iconName: 'bell', title: 'No activity yet', text: 'Likes, comments and new followers will show up here.' }));
        return;
      }
      cursor = res.nextCursor;
      if (cursor) {
        const more = h('button', { class: 'btn btn-ghost btn-sm' }, 'Load more');
        more.addEventListener('click', () => {
          setLoading(more, true);
          load();
        });
        list.append(h('div', { class: 'load-more' }, more));
      }
    } catch (err) {
      list.replaceWith(errorState(err));
    }
  }

  load().then(markAllRead);
  return view;
}

/* Search: people + posts --------------------------------------------------- */
export function searchView(params, ctx) {
  const initialQ = ctx.query.get('q') || '';
  let kind = ctx.query.get('type') === 'posts' || initialQ.startsWith('#') ? 'posts' : 'people';
  let list = null;
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Search people, posts or #hashtags', value: initialQ, 'aria-label': 'Search', autofocus: true });
  const results = h('div', { class: 'view' });
  const tabBtns = {};
  const tabs = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    ['people', 'posts'].map((k) => {
      tabBtns[k] = h('button', { class: 'tab', role: 'tab', type: 'button', onclick: () => ((kind = k), paintTabs(), run()) }, k === 'people' ? 'People' : 'Posts');
      return tabBtns[k];
    })
  );
  const indicator = h('span', { class: 'tab-indicator', 'aria-hidden': 'true' });
  tabs.prepend(indicator);
  function paintTabs() {
    for (const [k, b] of Object.entries(tabBtns)) {
      b.classList.toggle('active', k === kind);
      b.setAttribute('aria-selected', String(k === kind));
    }
    requestAnimationFrame(() => {
      const b = tabBtns[kind];
      indicator.style.width = `${b.offsetWidth}px`;
      indicator.style.transform = `translateX(${b.offsetLeft - 5}px)`;
    });
  }

  const view = h('div', { class: 'view' }, h('h1', { class: 'view-title' }, 'Search'), input, tabs, results);
  ctx.onLeave(() => list?.destroy());

  const hint = (text) => h('div', { class: 'card card-pad' }, h('p', { class: 'subtle', style: { margin: 0 } }, text));

  const run = debounce(async () => {
    const q = input.value.trim();
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (kind === 'posts') qs.set('type', 'posts');
    history.replaceState(null, '', `#/search${qs.toString() ? `?${qs}` : ''}`);
    list?.destroy();
    list = null;

    if (!q) {
      results.replaceChildren(hint(kind === 'posts' ? 'Search posts by keyword, or type a #hashtag.' : 'Start typing to find people.'));
      return;
    }
    if (kind === 'posts') {
      list = postList({
        load: (cursor) => api.searchPosts(q, cursor),
        empty: () => emptyState({ iconName: 'search', title: 'No posts found', text: `Nothing matches “${q}”. Try another keyword or hashtag.` }),
      });
      results.replaceChildren(list.el);
      return;
    }
    const box = h('div', { class: 'card card-pad' }, h('div', { class: 'user-list' }, userRowSkeleton(), userRowSkeleton()));
    results.replaceChildren(box);
    try {
      const { users } = await api.searchUsers(q);
      if (input.value.trim() !== q || kind !== 'people') return;
      box.replaceChildren(
        users.length ? h('div', { class: 'user-list' }, users.map((u) => userRow(u, { showBio: true }))) : h('p', { class: 'subtle', style: { margin: 0 } }, `No one found for “${q}”.`)
      );
    } catch (err) {
      box.replaceChildren(h('p', { class: 'subtle' }, err.message));
    }
  }, 300);

  input.addEventListener('input', run);
  paintTabs();
  run();
  return view;
}

/* Hashtag feed ----------------------------------------------------------- */
export function tagView({ tag }, ctx) {
  const clean = tag.replace(/^#/, '').toLowerCase();
  const count = h('span', { class: 'subtle' }, 'Loading…');
  const list = postList({
    load: async (cursor) => {
      const res = await api.tagPosts(clean, cursor);
      if (!cursor) count.textContent = `${compact(res.total)} post${res.total === 1 ? '' : 's'}`;
      return res;
    },
    empty: () => emptyState({ iconName: 'hash', title: `No posts with #${clean} yet`, text: 'Be the first - include this hashtag in a post.' }),
  });
  ctx.onLeave(() => list.destroy());
  return h(
    'div',
    { class: 'view' },
    h(
      'section',
      { class: 'card tag-hero' },
      h('div', { class: 'tag-hero-icon' }, icon('hash')),
      h('div', {}, h('h1', { class: 'view-title' }, `#${clean}`), count)
    ),
    list.el
  );
}

/* Settings ----------------------------------------------------------------- */
export function settingsView() {
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Update password');
  const form = h(
    'form',
    { class: 'form-stack', novalidate: true },
    field({ label: 'Current password', name: 'currentPassword', type: 'password', autocomplete: 'current-password' }),
    field({ label: 'New password', name: 'newPassword', type: 'password', autocomplete: 'new-password' }),
    h('div', {}, save)
  );
  const newPw = form.querySelector('input[name="newPassword"]');
  newPw.closest('.input-wrap').after(passwordChecklist(newPw));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!passwordMeetsRules(data.newPassword)) return showFieldErrors(form, { newPassword: 'Password does not meet the requirements' });
    setLoading(save, true);
    try {
      const res = await api.changePassword(data);
      tokenStore.set(res.token);
      form.reset();
      newPw.dispatchEvent(new Event('input'));
      showFieldErrors(form, {});
      toast.success('Password updated');
    } catch (err) {
      if (err.details && Object.keys(err.details).length) showFieldErrors(form, err.details);
      else toast.error(err.message);
    } finally {
      setLoading(save, false);
    }
  });

  const themeBtn = (value, label, iconName) => {
    const b = h('button', { class: `btn btn-sm ${currentTheme() === value ? 'btn-primary' : 'btn-outline'}`, type: 'button' }, icon(iconName, 'icon-sm'), label);
    b.addEventListener('click', () => {
      applyTheme(value);
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.replace('btn-primary', 'btn-outline'));
      b.classList.replace('btn-outline', 'btn-primary');
    });
    return b;
  };

  const me = store.get('user');
  return h(
    'div',
    { class: 'view' },
    h('h1', { class: 'view-title' }, 'Settings'),
    h(
      'section',
      { class: 'card card-pad' },
      h('h2', { class: 'card-title' }, 'Appearance'),
      h('div', { style: { display: 'flex', gap: '8px' } }, themeBtn('light', 'Light', 'sun'), themeBtn('dark', 'Dark', 'moon'))
    ),
    h('section', { class: 'card card-pad' }, h('h2', { class: 'card-title' }, 'Change password'), form),
    h(
      'section',
      { class: 'card card-pad' },
      h('h2', { class: 'card-title' }, 'Account'),
      h('p', { class: 'muted', style: { marginTop: 0 } }, `Signed in as @${me.username}`),
      h(
        'button',
        {
          class: 'btn btn-outline',
          type: 'button',
          onclick: async () => {
            if (await confirmDialog({ title: 'Log out?', message: 'You can log back in any time.', confirmText: 'Log out' })) endSession();
          },
        },
        icon('logout', 'icon-sm'),
        'Log out'
      )
    )
  );
}
