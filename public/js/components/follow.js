import { h, $$ } from '../dom.js';
import { api } from '../api.js';
import { store, emit } from '../store.js';
import { toast } from '../ui.js';

function paint(btn, following) {
  btn.classList.toggle('is-following', following);
  btn.classList.toggle('btn-primary', !following);
  btn.setAttribute('aria-pressed', String(following));
  btn.textContent = following ? 'Following' : 'Follow';
}

/** Keeps every follow button for `username` on screen in sync. */
export function syncFollowButtons(username, following) {
  $$(`[data-follow-user="${CSS.escape(username)}"]`).forEach((b) => paint(b, following));
}

export function followButton(user, { size = 'sm' } = {}) {
  const me = store.get('user');
  if (!me || me.username === user.username) return null;

  const btn = h('button', {
    class: `btn btn-${size} follow-btn`,
    type: 'button',
    dataset: { followUser: user.username },
  });
  paint(btn, Boolean(user.isFollowing));

  // Hovering an active follow reveals the destructive action.
  btn.addEventListener('mouseenter', () => btn.classList.contains('is-following') && (btn.textContent = 'Unfollow'));
  btn.addEventListener('mouseleave', () => btn.classList.contains('is-following') && (btn.textContent = 'Following'));

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !btn.classList.contains('is-following');
    // Optimistic UI: flip immediately, reconcile with the server response.
    syncFollowButtons(user.username, next);
    btn.disabled = true;
    try {
      const res = next ? await api.follow(user.username) : await api.unfollow(user.username);
      store.patchUser({ followingCount: Math.max(0, (store.get('user').followingCount || 0) + (next ? 1 : -1)) });
      emit('follow:changed', { username: user.username, isFollowing: res.isFollowing, followersCount: res.followersCount });
      if (next) toast.success(`You're now following @${user.username}`);
    } catch (err) {
      syncFollowButtons(user.username, !next);
      toast.error(err.message);
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}
