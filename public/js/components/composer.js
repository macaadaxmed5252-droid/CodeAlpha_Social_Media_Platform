import { h, icon, avatar } from '../dom.js';
import { api } from '../api.js';
import { store, emit } from '../store.js';
import { toast, setLoading } from '../ui.js';

export const MAX_POST = 2000;
const MB = 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const EMOJIS = ['😀', '😂', '🥹', '😍', '🤩', '😎', '🤔', '🙌', '👏', '🔥', '✨', '🎉', '💯', '❤️', '💜', '👀', '🚀', '🌟', '☕', '📸', '🎧', '💡', '✅', '🙏'];

/**
 * Validates a chosen file on the client before uploading (the server re-checks
 * the real bytes). Returns the file, or null after showing a toast.
 */
export function pickMedia(file, { allowVideo = true } = {}) {
  if (!file) return null;
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = allowVideo && VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    toast.error(allowVideo ? 'Use a JPG, PNG, GIF, WEBP image or an MP4, WEBM, MOV video' : 'Only JPG, PNG, GIF or WEBP images are allowed');
    return null;
  }
  if (isImage && file.size > 5 * MB) {
    toast.error('Images must be 5 MB or smaller');
    return null;
  }
  if (isVideo && file.size > 25 * MB) {
    toast.error('Videos must be 25 MB or smaller');
    return null;
  }
  return file;
}

export const pickImage = (file) => pickMedia(file, { allowVideo: false });

/** Builds a preview element (img or video) for a local file or a server media object. */
export function mediaPreview({ src, type }, onRemove) {
  const el =
    type === 'video'
      ? h('video', { src, controls: true, muted: true, playsInline: true, preload: 'metadata' })
      : h('img', { src, alt: 'Selected media preview' });
  return h(
    'div',
    { class: 'composer-preview' },
    el,
    type === 'video' ? h('span', { class: 'media-chip' }, icon('video', 'icon-sm'), 'Video') : null,
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Remove media', onclick: onRemove }, icon('x'))
  );
}

export function autosize(textarea) {
  const fit = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

/** Circular progress + numeric countdown for the character limit. */
export function charCounter(max) {
  const ring = h('span', { class: 'char-ring', 'aria-hidden': 'true' });
  const count = h('span', { class: 'char-count' });
  const update = (len) => {
    const left = max - len;
    ring.style.setProperty('--p', Math.min(100, (len / max) * 100));
    ring.classList.toggle('warn', left <= 100 && left >= 0);
    ring.classList.toggle('over', left < 0);
    count.textContent = left <= 100 ? String(left) : '';
    count.classList.toggle('over', left < 0);
  };
  update(0);
  return { el: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, count, ring), update };
}

export function composer({ onPosted, autofocus = false } = {}) {
  const me = store.get('user');
  let file = null;
  let previewUrl = null;

  const textarea = h('textarea', {
    name: 'text',
    rows: 1,
    placeholder: `What's happening, ${me.name.split(' ')[0]}?`,
    'aria-label': 'Write a post',
    maxlength: MAX_POST + 200,
    autofocus,
  });
  const fit = autosize(textarea);
  const counter = charCounter(MAX_POST);
  const preview = h('div', { hidden: true });
  const fileInput = h('input', { type: 'file', accept: [...IMAGE_TYPES, ...VIDEO_TYPES].join(','), hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-sm', type: 'submit', disabled: true }, 'Post');
  const emojiWrap = h('div', { class: 'menu-wrap' });

  function refresh() {
    const len = textarea.value.trim().length;
    counter.update(textarea.value.length);
    submit.disabled = (!len && !file) || textarea.value.length > MAX_POST;
  }

  function setFile(next) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = next;
    previewUrl = file ? URL.createObjectURL(file) : null;
    preview.replaceChildren();
    preview.hidden = !file;
    if (file) {
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      preview.append(mediaPreview({ src: previewUrl, type }, () => setFile(null)));
    }
    refresh();
  }

  fileInput.addEventListener('change', () => {
    setFile(pickMedia(fileInput.files[0]) || file);
    fileInput.value = '';
  });
  textarea.addEventListener('input', refresh);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !submit.disabled) form.requestSubmit();
  });

  // Paste an image straight from the clipboard.
  textarea.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file');
    if (item) {
      const picked = pickMedia(item.getAsFile());
      if (picked) setFile(picked);
    }
  });

  const emojiBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Add emoji', title: 'Emoji' }, icon('smile'));
  emojiWrap.append(emojiBtn);
  let emojiMenu = null;
  const closeEmoji = () => {
    emojiMenu?.remove();
    emojiMenu = null;
    document.removeEventListener('click', outsideEmoji, true);
  };
  const outsideEmoji = (e) => !emojiWrap.contains(e.target) && closeEmoji();
  emojiBtn.addEventListener('click', () => {
    if (emojiMenu) return closeEmoji();
    emojiMenu = h(
      'div',
      { class: 'menu emoji-menu' },
      EMOJIS.map((em) =>
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              const { selectionStart: s, selectionEnd: e } = textarea;
              textarea.setRangeText(em, s, e, 'end');
              textarea.focus();
              refresh();
              fit();
            },
          },
          em
        )
      )
    );
    emojiWrap.append(emojiMenu);
    document.addEventListener('click', outsideEmoji, true);
  });

  const form = h(
    'form',
    { class: 'card composer' },
    avatar(me, 'md'),
    h(
      'div',
      { class: 'composer-body' },
      textarea,
      preview,
      h(
        'div',
        { class: 'composer-footer' },
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Add photo', title: 'Photo', onclick: () => ((fileInput.accept = IMAGE_TYPES.join(',')), fileInput.click()) }, icon('image')),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Add video', title: 'Video (max 25 MB)', onclick: () => ((fileInput.accept = VIDEO_TYPES.join(',')), fileInput.click()) }, icon('video')),
        emojiWrap,
        fileInput,
        h('span', { class: 'spacer' }),
        counter.el,
        submit
      )
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    const fd = new FormData();
    fd.append('text', textarea.value);
    if (file) fd.append('media', file);
    setLoading(submit, true);
    try {
      const { post } = await api.createPost(fd);
      textarea.value = '';
      setFile(null);
      fit();
      store.patchUser({ postsCount: (store.get('user').postsCount || 0) + 1 });
      emit('post:created', post);
      onPosted?.(post);
      toast.success('Post created successfully ✨');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(submit, false);
      refresh();
    }
  });

  return form;
}
