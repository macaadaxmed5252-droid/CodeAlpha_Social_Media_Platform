import { h, icon, avatar, timeAgo, fullDate, debounce } from '../dom.js';
import { api, tokenStore } from '../api.js';
import { store } from '../store.js';
import { postSkeleton, emptyState, errorState, userRowSkeleton, field, setLoading, showFieldErrors, toast, confirmDialog } from '../ui.js';
import { navigate } from '../router.js';
import { postCard } from '../components/postCard.js';
import { userRow } from '../components/userRow.js';
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
const ACTIVITY = {
  like: { icon: 'heart', text: 'liked your post' },
  comment: { icon: 'comment', text: 'commented on your post' },
  reply: { icon: 'reply', text: 'replied to your comment' },
  follow: { icon: 'user', text: 'started following you' },
};

function activityItem(n, index) {
  const meta = ACTIVITY[n.type];
  const href = n.type === 'follow' ? `#/u/${n.actor.username}` : `#/p/${n.post.id}`;
  const snippet = n.comment?.text || n.post?.text || '';
  return h(
    'a',
    { class: `activity-item${n.read ? '' : ' unread'}`, href, style: { animationDelay: `${Math.min(index, 10) * 30}ms` } },
    avatar(n.actor, 'md', { link: false }),
    h('span', { class: `activity-icon ${n.type}`, 'aria-hidden': 'true' }, icon(meta.icon)),
    h(
      'div',
      { class: 'activity-body' },
      h('p', {}, h('strong', {}, n.actor.name), ` ${meta.text}`),
      snippet ? h('div', { class: 'activity-snippet' }, `“${snippet}”`) : null,
      h('time', { class: 'subtle', datetime: n.createdAt, title: fullDate(n.createdAt) }, timeAgo(n.createdAt))
    ),
    n.post?.image ? h('img', { class: 'activity-thumb', src: n.post.image, alt: '', loading: 'lazy' }) : null
  );
}

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

  load().then(() => {
    if (store.get('unread') > 0) api.markAllRead().then(() => store.set('unread', 0)).catch(() => {});
  });
  return view;
}

/* Search ------------------------------------------------------------------- */
export function searchView(params, ctx) {
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Search people by name or @username', value: ctx.query.get('q') || '', 'aria-label': 'Search people', autofocus: true });
  const results = h('div', { class: 'card card-pad' });
  const view = h('div', { class: 'view' }, h('h1', { class: 'view-title' }, 'Search'), input, results);

  const run = debounce(async () => {
    const q = input.value.trim();
    history.replaceState(null, '', `#/search${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (!q) {
      results.replaceChildren(h('p', { class: 'subtle', style: { margin: 0 } }, 'Start typing to find people.'));
      return;
    }
    results.replaceChildren(h('div', { class: 'user-list' }, userRowSkeleton(), userRowSkeleton()));
    try {
      const { users } = await api.searchUsers(q);
      if (input.value.trim() !== q) return;
      results.replaceChildren(
        users.length ? h('div', { class: 'user-list' }, users.map((u) => userRow(u, { showBio: true }))) : h('p', { class: 'subtle', style: { margin: 0 } }, `No one found for “${q}”.`)
      );
    } catch (err) {
      results.replaceChildren(h('p', { class: 'subtle' }, err.message));
    }
  }, 250);

  input.addEventListener('input', run);
  run();
  return view;
}

/* Settings ----------------------------------------------------------------- */
export function settingsView() {
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Update password');
  const form = h(
    'form',
    { class: 'form-stack', novalidate: true },
    field({ label: 'Current password', name: 'currentPassword', type: 'password', autocomplete: 'current-password' }),
    field({ label: 'New password', name: 'newPassword', type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters with a letter and a number' }),
    h('div', {}, save)
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    setLoading(save, true);
    try {
      const res = await api.changePassword(data);
      tokenStore.set(res.token);
      form.reset();
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
