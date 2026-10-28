import { h, icon, avatar, compact, richText } from '../dom.js';
import { api } from '../api.js';
import { store, listen } from '../store.js';
import { modal, field, setLoading, showFieldErrors, toast, profileSkeleton, emptyState, errorState, userRowSkeleton } from '../ui.js';
import { navigate } from '../router.js';
import { followButton } from '../components/follow.js';
import { userRow } from '../components/userRow.js';
import { postList } from '../components/postList.js';
import { pickImage, charCounter } from '../components/composer.js';

function connectionsModal(user, kind) {
  const body = h('div', { class: 'user-list' }, userRowSkeleton(), userRowSkeleton(), userRowSkeleton());
  const m = modal({ title: kind === 'followers' ? `Followers of @${user.username}` : `@${user.username} follows`, body });
  let page = 1;

  async function load() {
    try {
      const res = await (kind === 'followers' ? api.followers(user.username, page) : api.following(user.username, page));
      if (page === 1) body.replaceChildren();
      body.querySelector('.load-more')?.remove();
      if (!res.users.length && page === 1) {
        body.append(h('p', { class: 'subtle', style: { textAlign: 'center', padding: '20px 0' } }, kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'));
      }
      res.users.forEach((u) => body.append(userRow(u, { showBio: true, onNavigate: () => m.close() })));
      if (res.hasMore) {
        const more = h('button', { class: 'btn btn-ghost btn-sm' }, 'Load more');
        more.addEventListener('click', () => {
          page += 1;
          setLoading(more, true);
          load();
        });
        body.append(h('div', { class: 'load-more' }, more));
      }
    } catch (err) {
      body.replaceChildren(h('p', { class: 'subtle' }, err.message));
    }
  }
  load();
}

export function editProfileModal() {
  const me = store.get('user');
  let file = null;
  let removeAvatar = false;

  const preview = h('div');
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp', hidden: true });
  const removeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Remove');

  function paintAvatar() {
    const src = file ? URL.createObjectURL(file) : removeAvatar ? '' : me.avatar;
    preview.replaceChildren(avatar({ ...me, avatar: src }, 'lg', { link: false }));
    removeBtn.hidden = !src;
  }
  fileInput.addEventListener('change', () => {
    const picked = pickImage(fileInput.files[0]);
    if (picked) {
      file = picked;
      removeAvatar = false;
      paintAvatar();
    }
    fileInput.value = '';
  });
  removeBtn.addEventListener('click', () => {
    file = null;
    removeAvatar = true;
    paintAvatar();
  });
  paintAvatar();

  const bioField = field({ label: 'Bio', name: 'bio', textarea: true, value: me.bio, maxlength: 160, rows: 3 });
  const bioCounter = charCounter(160);
  bioCounter.update(me.bio.length);
  bioField.querySelector('label').append(' ', bioCounter.el);
  bioField.querySelector('label').style.cssText = 'display:flex;justify-content:space-between;align-items:center';
  bioField.querySelector('textarea').addEventListener('input', (e) => bioCounter.update(e.target.value.length));

  const form = h(
    'form',
    { class: 'form-stack', novalidate: true, id: 'edit-profile-form' },
    h(
      'div',
      { class: 'avatar-picker' },
      preview,
      h(
        'div',
        { class: 'avatar-picker-actions' },
        h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => fileInput.click() }, icon('image', 'icon-sm'), 'Upload photo'),
        removeBtn,
        h('span', { class: 'field-hint', style: { width: '100%' } }, 'JPG, PNG, GIF or WEBP · max 5 MB'),
        fileInput
      )
    ),
    h('div', { class: 'form-row' }, field({ label: 'Display name', name: 'name', value: me.name, maxlength: 50 }), field({ label: 'Username', name: 'username', value: me.username, maxlength: 20 })),
    bioField,
    h('div', { class: 'form-row' }, field({ label: 'Location', name: 'location', value: me.location, maxlength: 40 }), field({ label: 'Website', name: 'website', value: me.website, maxlength: 100, placeholder: 'example.com' }))
  );

  const save = h('button', { class: 'btn btn-primary', type: 'submit', form: 'edit-profile-form' }, 'Save');
  const m = modal({ title: 'Edit profile', body: form, footer: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.name.trim()) return showFieldErrors(form, { name: 'Display name is required' });
    const fd = new FormData();
    for (const key of ['name', 'username', 'bio', 'location', 'website']) fd.append(key, data[key]);
    if (file) fd.append('avatar', file);
    else if (removeAvatar) fd.append('removeAvatar', 'true');

    setLoading(save, true);
    try {
      const res = await api.updateMe(fd);
      const usernameChanged = res.user.username !== me.username;
      store.set('user', { ...store.get('user'), ...res.user });
      m.close();
      toast.success('Profile updated');
      navigate(`/u/${res.user.username}`, { replace: usernameChanged });
    } catch (err) {
      if (err.details && Object.keys(err.details).length) showFieldErrors(form, err.details);
      else toast.error(err.message);
    } finally {
      setLoading(save, false);
    }
  });
}

function profileHeader(user) {
  const stat = (value, label, onClick) =>
    h('button', { class: 'stat', type: 'button', onclick: onClick }, h('strong', { dataset: { stat: label } }, compact(value)), h('span', {}, label));

  const facts = [];
  if (user.location) facts.push(h('span', {}, icon('pin', 'icon-sm'), user.location));
  if (user.website) {
    facts.push(
      h('a', { href: user.website, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('link', 'icon-sm'), user.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))
    );
  }
  facts.push(h('span', {}, icon('calendar', 'icon-sm'), `Joined ${new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`));

  const actions = user.isMe
    ? h('button', { class: 'btn btn-outline btn-sm', onclick: editProfileModal }, icon('edit', 'icon-sm'), 'Edit profile')
    : followButton(user, { size: 'sm' });

  return h(
    'section',
    { class: 'card profile-card' },
    h('div', { class: 'profile-cover' }),
    h(
      'div',
      { class: 'profile-body' },
      h('div', { class: 'profile-top' }, avatar(user, 'xl', { link: false }), h('div', { class: 'profile-actions' }, actions)),
      h('h1', { class: 'profile-name' }, user.name),
      h('div', { class: 'profile-handle' }, `@${user.username}`, user.followsYou ? h('span', { class: 'follows-you' }, 'Follows you') : null),
      user.bio ? h('p', { class: 'profile-bio' }, richText(user.bio)) : null,
      h('div', { class: 'profile-facts' }, facts),
      h(
        'div',
        { class: 'profile-stats' },
        h('div', { class: 'stat' }, h('strong', {}, compact(user.postsCount)), h('span', {}, 'Posts')),
        stat(user.followersCount, 'Followers', () => connectionsModal(user, 'followers')),
        stat(user.followingCount, 'Following', () => connectionsModal(user, 'following'))
      )
    )
  );
}

export function profileView({ username }, ctx) {
  const view = h('div', { class: 'view' }, profileSkeleton());
  let list;

  async function load() {
    try {
      const { user } = await api.profile(username);
      if (!ctx.isCurrent()) return;
      let header = profileHeader(user);
      list = postList({
        load: (cursor) => api.userPosts(user.username, cursor),
        empty: () =>
          emptyState({
            iconName: 'image',
            title: user.isMe ? 'Share your first post' : 'No posts yet',
            text: user.isMe ? 'Your posts will show up here.' : `When @${user.username} posts, you’ll see it here.`,
          }),
      });
      view.replaceChildren(header, list.el);

      ctx.onLeave(() => list.destroy());
      ctx.onLeave(
        listen('follow:changed', (d) => {
          if (d.username === user.username) {
            const el = header.querySelector('[data-stat="Followers"]');
            if (el) el.textContent = compact(d.followersCount);
          }
        })
      );
      if (user.isMe) {
        ctx.onLeave(listen('post:created', (post) => list.prepend(post)));
        ctx.onLeave(
          store.on('user', (me) => {
            if (!me || me.id !== user.id) return;
            const next = profileHeader({ ...user, ...me, isMe: true });
            header.replaceWith(next);
            header = next;
          })
        );
      }
    } catch (err) {
      view.replaceChildren(
        err.status === 404
          ? emptyState({ iconName: 'user', title: 'User not found', text: `@${username} doesn’t exist or may have changed their username.`, action: h('a', { class: 'btn btn-primary', href: '#/explore' }, 'Explore') })
          : errorState(err, load)
      );
    }
  }
  load();
  return view;
}
