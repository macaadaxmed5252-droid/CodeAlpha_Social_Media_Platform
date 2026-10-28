import { h, icon, avatar, timeAgo, fullDate } from '../dom.js';
import { api } from '../api.js';
import { store, listen } from '../store.js';
import { userRowSkeleton } from '../ui.js';
import { navigate } from '../router.js';

const ACTIVITY = {
  like: { icon: 'heart', text: 'liked your post' },
  comment: { icon: 'comment', text: 'commented on your post' },
  reply: { icon: 'reply', text: 'replied to your comment' },
  follow: { icon: 'user', text: 'started following you' },
};

export function activityItem(n, index = 0, { onNavigate } = {}) {
  const meta = ACTIVITY[n.type];
  const href = n.type === 'follow' ? `#/u/${n.actor.username}` : `#/p/${n.post.id}`;
  const snippet = n.comment?.text || n.post?.text || '';
  const media = n.post?.media;
  return h(
    'a',
    { class: `activity-item${n.read ? '' : ' unread'}`, href, onclick: onNavigate, style: { animationDelay: `${Math.min(index, 10) * 30}ms` } },
    avatar(n.actor, 'md', { link: false }),
    h('span', { class: `activity-icon ${n.type}`, 'aria-hidden': 'true' }, icon(meta.icon)),
    h(
      'div',
      { class: 'activity-body' },
      h('p', {}, h('strong', {}, n.actor.name), ` ${meta.text}`),
      snippet ? h('div', { class: 'activity-snippet' }, `“${snippet}”`) : null,
      h('time', { class: 'subtle', datetime: n.createdAt, title: fullDate(n.createdAt) }, timeAgo(n.createdAt))
    ),
    media?.type === 'image'
      ? h('img', { class: 'activity-thumb', src: media.url, alt: '', loading: 'lazy' })
      : media?.type === 'video'
        ? h('span', { class: 'activity-thumb activity-thumb-video' }, icon('video', 'icon-sm'))
        : null
  );
}

export async function markAllRead() {
  if (store.get('unread') === 0) return;
  try {
    await api.markAllRead();
    store.set('unread', 0);
  } catch {
    /* best-effort */
  }
}

function badge() {
  const n = store.get('unread');
  return n > 0 ? h('span', { class: 'badge', 'aria-label': `${n} unread` }, n > 99 ? '99+' : String(n)) : null;
}

/**
 * Bell button with a live unread badge and a dropdown of the latest activity.
 * Opening it loads fresh items and marks everything as read; new activity
 * arriving while it is open is pulled in automatically.
 */
export function notificationHub() {
  const trigger = h('button', { class: 'topnav-link', type: 'button', 'aria-label': 'Notifications', title: 'Notifications', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', dataset: { nav: '/activity' } }, icon('bell'), badge());
  const list = h('div', { class: 'notif-list' });
  const markBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Mark all read');
  const panel = h(
    'div',
    { class: 'notif-panel', role: 'dialog', 'aria-label': 'Notifications', hidden: true },
    h('div', { class: 'notif-head' }, h('h2', {}, 'Notifications'), markBtn),
    list,
    h('a', { class: 'notif-foot', href: '#/activity', onclick: () => close() }, 'View all activity')
  );
  const wrap = h('div', { class: 'menu-wrap notif-hub' }, trigger, panel);

  let open = false;
  let loading = false;

  async function load() {
    if (loading) return;
    loading = true;
    if (!list.children.length) list.replaceChildren(userRowSkeleton(), userRowSkeleton(), userRowSkeleton());
    try {
      const { notifications } = await api.notifications(null, 8);
      list.replaceChildren(
        ...(notifications.length
          ? notifications.map((n, i) => activityItem(n, i, { onNavigate: () => close() }))
          : [h('div', { class: 'notif-empty' }, icon('bell'), h('p', {}, 'You’re all caught up!'), h('span', { class: 'subtle' }, 'Likes, comments and follows will appear here.'))])
      );
    } catch (err) {
      list.replaceChildren(h('p', { class: 'subtle', style: { padding: '16px' } }, err.message));
    } finally {
      loading = false;
    }
  }

  const outside = (e) => !wrap.contains(e.target) && close();
  const onKey = (e) => e.key === 'Escape' && (close(), trigger.focus());

  function show() {
    open = true;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('active');
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', onKey);
    load().then(markAllRead);
  }

  function close() {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.toggle('active', location.hash.startsWith('#/activity'));
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey);
  }

  trigger.addEventListener('click', () => {
    // On small screens the dropdown would be cramped; go to the full page.
    if (matchMedia('(max-width: 560px)').matches) return navigate('/activity');
    if (open) close();
    else show();
  });
  markBtn.addEventListener('click', async () => {
    await markAllRead();
    list.querySelectorAll('.unread').forEach((el) => el.classList.remove('unread'));
  });

  store.on('unread', () => {
    trigger.querySelector('.badge')?.remove();
    const b = badge();
    if (b) trigger.append(b);
  });
  listen('rt:notification', () => open && load().then(markAllRead));

  return wrap;
}
