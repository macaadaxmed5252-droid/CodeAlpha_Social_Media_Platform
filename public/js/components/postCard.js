import { h, icon, avatar, timeAgo, fullDate, richText, compact } from '../dom.js';
import { api } from '../api.js';
import { store, emit } from '../store.js';
import { toast, dropdown, confirmDialog, lightbox, modal, setLoading } from '../ui.js';
import { commentsSection } from './comments.js';
import { autosize, charCounter, pickMedia, mediaPreview, MAX_POST, IMAGE_TYPES, VIDEO_TYPES } from './composer.js';
import { userRow } from './userRow.js';

const PARTICLE_COLORS = ['#ff3d6e', '#7c5cff', '#ffb020', '#12b981', '#ff5c8a'];

function burst(button) {
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    const p = h('span', {
      class: 'particle',
      style: {
        background: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        '--dx': `${Math.cos(angle) * 26}px`,
        '--dy': `${Math.sin(angle) * 26}px`,
      },
    });
    button.append(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function setCount(el, value) {
  const text = value > 0 ? compact(value) : '';
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('bump');
  void el.offsetWidth; // restart the animation
  el.classList.add('bump');
}

async function shareLink(post) {
  const url = `${location.origin}/#/p/${post.id}`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: `${post.author.name} on Pulse`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  } catch (err) {
    if (err?.name !== 'AbortError') toast.info(url);
  }
}

export function showLikers(post) {
  const body = h('div', { class: 'user-list' }, h('p', { class: 'subtle' }, 'Loading…'));
  const m = modal({ title: 'Liked by', body });
  api
    .likers(post.id)
    .then(({ users }) => {
      body.replaceChildren(
        ...(users.length ? users.map((u) => userRow(u, { onNavigate: () => m.close() })) : [h('p', { class: 'subtle' }, 'No likes yet.')])
      );
    })
    .catch((err) => body.replaceChildren(h('p', { class: 'subtle' }, err.message)));
}

function editPost(post, onSaved) {
  let file = null;
  let removeMedia = false;
  let previewUrl = null;
  const textarea = h('textarea', { class: 'textarea', name: 'text', rows: 4, maxlength: MAX_POST + 200 }, post.text);
  const counter = charCounter(MAX_POST);
  counter.update(post.text.length);
  const mediaBox = h('div', { class: 'form-stack' });
  const fileInput = h('input', { type: 'file', accept: [...IMAGE_TYPES, ...VIDEO_TYPES].join(','), hidden: true });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save changes');

  function current() {
    if (file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      return { src: previewUrl, type: file.type.startsWith('video/') ? 'video' : 'image' };
    }
    return removeMedia || !post.media ? null : { src: post.media.url, type: post.media.type };
  }

  function renderMedia() {
    const media = current();
    mediaBox.replaceChildren();
    if (media) {
      mediaBox.append(
        mediaPreview(media, () => {
          file = null;
          removeMedia = true;
          renderMedia();
        })
      );
    }
    mediaBox.append(
      h(
        'div',
        {},
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => fileInput.click() }, icon('image', 'icon-sm'), media ? 'Replace photo or video' : 'Add photo or video')
      )
    );
  }
  fileInput.addEventListener('change', () => {
    const picked = pickMedia(fileInput.files[0]);
    if (picked) {
      file = picked;
      removeMedia = false;
      renderMedia();
    }
    fileInput.value = '';
  });
  textarea.addEventListener('input', () => counter.update(textarea.value.length));
  autosize(textarea);
  renderMedia();

  const m = modal({
    title: 'Edit post',
    body: h('div', { class: 'form-stack' }, textarea, h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, counter.el), mediaBox, fileInput),
    footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancel'), save],
  });

  save.addEventListener('click', async () => {
    if (textarea.value.length > MAX_POST) return toast.error(`Posts cannot exceed ${MAX_POST} characters`);
    const fd = new FormData();
    fd.append('text', textarea.value);
    if (file) fd.append('media', file);
    else if (removeMedia) fd.append('removeMedia', 'true');
    setLoading(save, true);
    try {
      const res = await api.updatePost(post.id, fd);
      onSaved(res.post);
      m.close();
      toast.success('Post updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(save, false);
    }
  });
}

/**
 * A feed post with optimistic likes, inline comments, owner menu and
 * real-time counter updates (see app.js -> realtime handlers).
 */
export function postCard(initial, { expanded = false, onDeleted } = {}) {
  let post = { ...initial };
  const card = h('article', { class: 'card post', dataset: { postId: post.id } });

  // Like state: `liked` is what the user wants, `server*` is the last confirmed state.
  let liked = post.likedByMe;
  let likes = post.likesCount;
  let serverLiked = liked;
  let serverLikes = likes;
  let inflight = false;
  let comments = null;

  const likeCount = h('span', { class: 'count' });
  const likeBtn = h('button', { class: 'action like', type: 'button' }, icon('heart'), likeCount);
  const commentCount = h('span', { class: 'count' });
  const commentBtn = h('button', { class: 'action', type: 'button', 'aria-label': 'Comments' }, icon('comment'), commentCount);

  function paintLike() {
    likeBtn.classList.toggle('liked', liked);
    likeBtn.setAttribute('aria-pressed', String(liked));
    likeBtn.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'} (${likes} likes)`);
    setCount(likeCount, likes);
  }

  async function syncLike() {
    if (inflight) return;
    inflight = true;
    try {
      // Loop so rapid toggles collapse into the minimum number of requests.
      while (serverLiked !== liked) {
        const target = liked;
        const res = target ? await api.like(post.id) : await api.unlike(post.id);
        serverLiked = target;
        serverLikes = res.likesCount;
      }
      likes = serverLikes;
    } catch (err) {
      liked = serverLiked;
      likes = serverLikes;
      toast.error(err.message);
    } finally {
      inflight = false;
      paintLike();
    }
  }

  function toggleLike(force) {
    if (!store.get('user')) return toast.info('Log in to like posts');
    const next = force ?? !liked;
    if (next === liked) return;
    liked = next;
    likes += next ? 1 : -1;
    paintLike();
    if (next) {
      likeBtn.classList.remove('pop');
      void likeBtn.offsetWidth;
      likeBtn.classList.add('pop');
      burst(likeBtn);
    }
    syncLike();
  }

  likeBtn.addEventListener('click', () => toggleLike());
  commentBtn.addEventListener('click', () => toggleComments());

  function setCommentCount(n) {
    post.commentsCount = n;
    setCount(commentCount, n);
  }

  function toggleComments(force) {
    const open = force ?? !comments;
    if (open && !comments) {
      comments = commentsSection(post, { onCount: setCommentCount });
      card.append(comments);
      comments.querySelector('input')?.focus({ preventScroll: true });
    } else if (!open && comments) {
      comments.remove();
      comments = null;
    }
    commentBtn.setAttribute('aria-expanded', String(Boolean(comments)));
  }

  function menu() {
    const trigger = h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Post options' }, icon('more'));
    const items = [{ icon: 'link', label: 'Copy link', onSelect: () => shareLink(post) }];
    if (post.isMine) {
      items.unshift(
        { icon: 'edit', label: 'Edit post', onSelect: () => editPost(post, update) },
        { icon: 'trash', label: 'Delete post', danger: true, onSelect: remove }
      );
    }
    return dropdown(trigger, items);
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete post?',
      message: 'This can’t be undone. The post, its image and all comments will be removed.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePost(post.id);
      store.patchUser({ postsCount: Math.max(0, (store.get('user').postsCount || 1) - 1) });
      animateOut();
      emit('post:removed', post.id);
      onDeleted?.(post.id);
      toast.success('Post deleted');
    } catch (err) {
      toast.error(err.message);
    }
  }

  function animateOut() {
    card.style.height = `${card.offsetHeight}px`;
    card.classList.add('is-removing');
    card.addEventListener('animationend', () => card.remove(), { once: true });
  }

  function mediaBlock() {
    if (!post.media) return null;
    if (post.media.type === 'video') {
      // Videos never autoplay with sound; metadata-only preload keeps feeds light.
      const video = h('video', { src: post.media.url, controls: true, playsInline: true, preload: 'metadata', 'aria-label': `Video posted by ${post.author.name}` });
      return h('div', { class: 'post-image post-video' }, video);
    }
    const heart = icon('heart', 'heart-burst');
    const img = h('img', { src: post.media.url, alt: `Image posted by ${post.author.name}`, loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.classList.add('loaded'));
    const wrap = h('div', { class: 'post-image' }, img, heart);
    // Single click opens the lightbox; double-click likes (Instagram-style).
    let timer = null;
    wrap.addEventListener('click', () => {
      clearTimeout(timer);
      timer = setTimeout(() => lightbox(post.media.url), 230);
    });
    wrap.addEventListener('dblclick', () => {
      clearTimeout(timer);
      heart.classList.remove('play');
      void heart.offsetWidth;
      heart.classList.add('play');
      toggleLike(true);
    });
    return wrap;
  }

  function textBlock() {
    if (!post.text) return null;
    const p = h('p', { class: 'post-text' }, richText(post.text));
    const long = post.text.length > 600 || post.text.split('\n').length > 8;
    if (!long || expanded) return p;
    p.classList.add('clamped');
    const more = h('button', { class: 'read-more', type: 'button' }, 'Show more');
    more.addEventListener('click', () => {
      p.classList.remove('clamped');
      more.remove();
    });
    return h('div', {}, p, more);
  }

  function render() {
    const author = post.author;
    card.replaceChildren(
      h(
        'header',
        { class: 'post-head' },
        avatar(author, 'md'),
        h(
          'div',
          { class: 'post-meta' },
          h('a', { class: 'post-author', href: `#/u/${author.username}` }, author.name),
          h(
            'div',
            { class: 'post-sub' },
            h('a', { href: `#/u/${author.username}` }, `@${author.username}`),
            ' · ',
            h('a', { href: `#/p/${post.id}`, title: fullDate(post.createdAt) }, h('time', { datetime: post.createdAt }, timeAgo(post.createdAt))),
            post.editedAt ? h('span', { class: 'edited-tag', title: `Edited ${fullDate(post.editedAt)}` }, ' · edited') : null
          )
        ),
        menu()
      ),
      textBlock(),
      mediaBlock(),
      h(
        'footer',
        { class: 'post-actions' },
        likeBtn,
        commentBtn,
        h('span', { class: 'spacer' }),
        expanded && post.likesCount > 0
          ? h('button', { class: 'action', type: 'button', onclick: () => showLikers(post) }, icon('users', 'icon-sm'), 'Likes')
          : null,
        h('button', { class: 'action', type: 'button', 'aria-label': 'Share', onclick: () => shareLink(post) }, icon('share'))
      )
    );
    paintLike();
    setCount(commentCount, post.commentsCount);
    if (comments) card.append(comments);
  }

  function update(next) {
    post = { ...post, ...next };
    if (!inflight) {
      liked = serverLiked = post.likedByMe;
      likes = serverLikes = post.likesCount;
    }
    render();
  }

  // Hooks used by the realtime layer (app.js).
  card.applyStats = ({ likesCount, commentsCount }) => {
    if (!inflight && likesCount !== undefined) {
      likes = serverLikes = likesCount;
      post.likesCount = likesCount;
      paintLike();
    }
    if (commentsCount !== undefined) setCommentCount(commentsCount);
  };
  card.refresh = async () => {
    try {
      const res = await api.post(post.id);
      update(res.post);
    } catch {
      /* ignore */
    }
  };
  card.onCommentEvent = (evt) => {
    if (!comments) return;
    if (evt.type === 'new' && evt.authorId !== store.get('user')?.id) comments.refresh();
    if (evt.type === 'deleted') comments.removeIds(evt.ids);
  };
  card.removeAnimated = animateOut;

  render();
  if (expanded) toggleComments(true);
  return card;
}

