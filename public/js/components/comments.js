import { h, icon, avatar, timeAgo, fullDate, richText } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { toast, confirmDialog, userRowSkeleton } from '../ui.js';

const MAX_COMMENT = 500;

/**
 * Comment thread for one post: root comments with one level of replies.
 * `onCount(n)` keeps the parent card's comment counter in sync.
 */
export function commentsSection(post, { onCount } = {}) {
  const me = store.get('user');
  const list = h('div', { class: 'comment-list' });
  const section = h('section', { class: 'comments', 'aria-label': 'Comments' });
  let replyTo = null; // { id, username }
  let comments = [];

  const input = h('input', {
    class: 'input',
    name: 'comment',
    placeholder: 'Write a comment…',
    maxlength: MAX_COMMENT,
    autocomplete: 'off',
    'aria-label': 'Write a comment',
  });
  const sendBtn = h('button', { type: 'submit', class: 'btn-icon', 'aria-label': 'Send comment', disabled: true }, icon('send', 'icon-sm'));
  const replyBanner = h('div', { class: 'replying-to', hidden: true });
  const form = h('form', { class: 'comment-form' }, avatar(me, 'sm', { link: false }), h('div', { class: 'input-wrap' }, input, sendBtn));

  input.addEventListener('input', () => (sendBtn.disabled = !input.value.trim()));

  function setReply(target) {
    replyTo = target;
    replyBanner.hidden = !target;
    replyBanner.replaceChildren();
    if (target) {
      replyBanner.append(
        icon('reply', 'icon-sm'),
        'Replying to ',
        h('strong', {}, `@${target.username}`),
        h('button', { type: 'button', onclick: () => setReply(null) }, 'Cancel')
      );
      input.placeholder = `Reply to @${target.username}…`;
      input.focus();
    } else {
      input.placeholder = 'Write a comment…';
    }
  }

  function commentNode(c) {
    const tools = h(
      'div',
      { class: 'comment-tools' },
      h('time', { datetime: c.createdAt, title: fullDate(c.createdAt) }, timeAgo(c.createdAt)),
      h('button', { type: 'button', onclick: () => setReply({ id: c.parent || c.id, username: c.author.username }) }, 'Reply'),
      c.canDelete ? h('button', { type: 'button', class: 'danger', onclick: () => remove(c) }, 'Delete') : null
    );
    return h(
      'div',
      { class: `comment${c.parent ? ' reply' : ''}`, dataset: { commentId: c.id } },
      avatar(c.author, c.parent ? 'xs' : 'sm'),
      h(
        'div',
        { class: 'comment-bubble' },
        h(
          'div',
          { class: 'comment-content' },
          h('a', { class: 'comment-author', href: `#/u/${c.author.username}` }, c.author.name),
          h('p', { class: 'comment-text' }, richText(c.text))
        ),
        tools
      )
    );
  }

  function render() {
    list.replaceChildren();
    const roots = comments.filter((c) => !c.parent);
    if (!roots.length) {
      list.append(h('p', { class: 'comments-empty' }, 'No comments yet - start the conversation 💬'));
      return;
    }
    for (const root of roots) {
      list.append(commentNode(root));
      comments.filter((c) => c.parent === root.id).forEach((r) => list.append(commentNode(r)));
    }
  }

  async function load() {
    list.replaceChildren(userRowSkeleton(), userRowSkeleton());
    try {
      ({ comments } = await api.comments(post.id));
      render();
    } catch (err) {
      list.replaceChildren(h('p', { class: 'comments-empty' }, err.message));
    }
  }

  async function remove(c) {
    const ok = await confirmDialog({
      title: 'Delete comment?',
      message: c.parent ? 'This reply will be removed.' : 'This comment and its replies will be removed.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.deleteComment(post.id, c.id);
      comments = comments.filter((x) => !res.removed.includes(x.id));
      render();
      onCount?.(res.commentsCount);
      toast.success('Comment deleted');
    } catch (err) {
      toast.error(err.message);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    input.disabled = true;
    try {
      const res = await api.addComment(post.id, { text, parentId: replyTo?.id });
      comments.push(res.comment);
      input.value = '';
      setReply(null);
      render();
      onCount?.(res.commentsCount);
      list.querySelector(`[data-comment-id="${res.comment.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      input.disabled = false;
      input.focus();
      sendBtn.disabled = !input.value.trim();
    }
  });

  section.append(replyBanner, form, list);
  section.refresh = async () => {
    try {
      ({ comments } = await api.comments(post.id));
      render();
    } catch {
      /* realtime refresh is best-effort */
    }
  };
  section.removeIds = (ids) => {
    comments = comments.filter((c) => !ids.includes(c.id));
    render();
  };
  load();
  return section;
}
