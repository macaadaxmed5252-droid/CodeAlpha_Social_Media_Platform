import { h, avatar } from '../dom.js';
import { followButton } from './follow.js';

export function userRow(user, { showBio = false, onNavigate } = {}) {
  const row = h(
    'div',
    { class: 'user-row' },
    avatar(user, 'sm'),
    h(
      'a',
      { class: 'user-row-info', href: `#/u/${user.username}`, onclick: onNavigate },
      h('span', { class: 'user-row-name' }, user.name),
      h('span', { class: 'user-row-handle' }, showBio && user.bio ? user.bio : `@${user.username}`)
    ),
    followButton(user)
  );
  if (onNavigate) row.querySelector('a.avatar')?.addEventListener('click', onNavigate);
  return row;
}
