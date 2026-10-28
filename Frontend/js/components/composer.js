import { h, icon, avatar } from '../dom.js';
import { api } from '../api.js';
import { store, emit } from '../store.js';
import { toast, setLoading } from '../ui.js';

export const MAX_POST = 2000;
const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const EMOJIS = ['😀', '😂', '🥹', '😍', '🤩', '😎', '🤔', '🙌', '👏', '🔥', '✨', '🎉', '💯', '❤️', '💜', '👀', '🚀', '🌟', '☕', '📸', '🎧', '💡', '✅', '🙏'];

/** Validates a chosen file on the client before uploading (the server re-checks). */
export function pickImage(file) {
  if (!file) return null;
  if (!IMAGE_TYPES.includes(file.type)) {
    toast.error('Only JPG, PNG, GIF or WEBP images are allowed');
    return null;
  }
  if (file.size > MAX_IMAGE) {
    toast.error('Images must be 5 MB or smaller');
    return null;
  }
  return file;
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
  const preview = h('div', { class: 'composer-preview', hidden: true });
  const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), hidden: true });
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
      preview.append(
        h('img', { src: previewUrl, alt: 'Selected image preview' }),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Remove image', onclick: () => setFile(null) }, icon('x'))
      );
    }
    refresh();
  }

  fileInput.addEventListener('change', () => {
    setFile(pickImage(fileInput.files[0]) || file);
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
      const picked = pickImage(item.getAsFile());
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
      { class: 'menu', style: { left: 0, right: 'auto', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', minWidth: '240px' } },
      EMOJIS.map((em) =>
        h(
          'button',
          {
            type: 'button',
            style: { justifyContent: 'center', fontSize: '20px', padding: '6px' },
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
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Add image', title: 'Add image', onclick: () => fileInput.click() }, icon('image')),
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
    if (file) fd.append('image', file);
    setLoading(submit, true);
    try {
      const { post } = await api.createPost(fd);
      textarea.value = '';
      setFile(null);
      fit();
      store.patchUser({ postsCount: (store.get('user').postsCount || 0) + 1 });
      emit('post:created', post);
      onPosted?.(post);
      toast.success('Your post is live ✨');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(submit, false);
      refresh();
    }
  });

  return form;
}
