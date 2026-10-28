import { h, icon, avatar, compact, debounce, $ } from './dom.js';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';
import { store, listen } from './store.js';
import { toast, modal, dropdown, confirmDialog, userRowSkeleton } from './ui.js';
import { route, startRouter, onAfterRender, navigate, currentPath } from './router.js';
import { startSession, endSession } from './session.js';
import { toggleTheme, onThemeChange, currentTheme } from './theme.js';
import { composer } from './components/composer.js';
import { userRow } from './components/userRow.js';
import { notificationHub } from './components/notifications.js';
import { loginView, registerView } from './views/auth.js';
import { feedView } from './views/feed.js';
import { profileView, editProfileModal } from './views/profile.js';
import { postView, activityView, searchView, settingsView, tagView } from './views/misc.js';

/* Routes ------------------------------------------------------------------ */
route('/login', loginView, { auth: false, guestOnly: true, layout: 'auth' });
route('/register', registerView, { auth: false, guestOnly: true, layout: 'auth' });
route('/', feedView('foryou'));
route('/following', feedView('following'));
route('/explore', feedView('foryou')); // legacy alias
route('/tag/:tag', tagView);
route('/activity', activityView);
route('/search', searchView);
route('/settings', settingsView);
route('/u/:username', profileView);
route('/p/:id', postView);

/* Chrome (topbar, sidebars, dock) ------------------------------------------ */
const NAV = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/search', label: 'Search', icon: 'search' },
  { path: '/activity', label: 'Activity', icon: 'bell', badge: true },
];

function openComposer() {
  const m = modal({ title: 'Create post', body: composer({ autofocus: true, onPosted: () => m.close() }) });
  m.el.querySelector('.composer').classList.remove('card');
  m.el.querySelector('.modal-body').style.padding = '0';
}

function isActive(path) {
  const current = currentPath();
  if (path.startsWith('/u/')) return current === path;
  return current === path;
}

function badge() {
  const n = store.get('unread');
  return n > 0 ? h('span', { class: 'badge', 'aria-label': `${n} unread` }, n > 99 ? '99+' : String(n)) : null;
}

function navLink(item, cls = 'topnav-link') {
  return h(
    'a',
    { class: `${cls}${isActive(item.path) ? ' active' : ''}`, href: `#${item.path}`, 'aria-label': item.label, title: item.label, dataset: { nav: item.path } },
    icon(item.icon),
    item.badge ? badge() : null
  );
}

function searchBox() {
  const input = h('input', { type: 'search', placeholder: 'Search people, posts, #tags', 'aria-label': 'Search', autocomplete: 'off' });
  const panel = h('div', { class: 'search-results', hidden: true });
  const wrap = h('div', { class: 'search', role: 'search' }, icon('search', 'icon-sm'), input, panel);

  const hide = () => (panel.hidden = true);
  const run = debounce(async () => {
    const q = input.value.trim();
    if (!q) return hide();
    panel.hidden = false;
    panel.replaceChildren(userRowSkeleton(), userRowSkeleton());
    const done = () => ((input.value = ''), hide());
    const isTag = /^#[p{L}p{N}_]{2,50}$/u.test(q);
    const shortcut = isTag
      ? h('a', { class: 'search-shortcut', href: `#/tag/${encodeURIComponent(q.slice(1).toLowerCase())}`, onclick: done }, icon('hash', 'icon-sm'), 'See posts tagged ', h('strong', {}, q))
      : h('a', { class: 'search-shortcut', href: `#/search?type=posts&q=${encodeURIComponent(q)}`, onclick: done }, icon('search', 'icon-sm'), 'Search posts for ', h('strong', {}, `“${q}”`));
    try {
      const { users } = isTag ? { users: [] } : await api.searchUsers(q);
      if (input.value.trim() !== q) return;
      panel.replaceChildren(
        shortcut,
        ...(users.length
          ? users.slice(0, 6).map((u) => userRow(u, { onNavigate: done }))
          : isTag
            ? []
            : [h('p', { class: 'subtle', style: { padding: '10px', margin: 0 } }, `No people match “${q}”`)])
      );
    } catch (err) {
      panel.replaceChildren(h('p', { class: 'subtle', style: { padding: '10px', margin: 0 } }, err.message));
    }
  }, 220);

  input.addEventListener('input', run);
  input.addEventListener('focus', () => input.value.trim() && run());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      hide();
      input.blur();
    }
    if (e.key === 'Enter' && input.value.trim()) {
      const q = input.value.trim();
      navigate(q.startsWith('#') ? `/tag/${encodeURIComponent(q.slice(1).toLowerCase())}` : `/search?q=${encodeURIComponent(q)}`);
      input.value = '';
      hide();
    }
  });
  document.addEventListener('click', (e) => !wrap.contains(e.target) && hide());
  return wrap;
}

function themeButton() {
  const btn = h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Toggle theme', title: 'Toggle theme', onclick: toggleTheme });
  const paint = () => btn.replaceChildren(icon(currentTheme() === 'dark' ? 'sun' : 'moon'));
  paint();
  onThemeChange(paint);
  return btn;
}

function renderTopbar() {
  const me = store.get('user');
  const accountMenu = dropdown(h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Account menu', style: { padding: 0 } }, avatar(me, 'sm', { link: false })), [
    { icon: 'user', label: 'My profile', onSelect: () => navigate(`/u/${me.username}`) },
    { icon: 'edit', label: 'Edit profile', onSelect: editProfileModal },
    { icon: 'settings', label: 'Settings', onSelect: () => navigate('/settings') },
    {
      icon: 'logout',
      label: 'Log out',
      danger: true,
      onSelect: async () => (await confirmDialog({ title: 'Log out?', message: 'You can log back in any time.', confirmText: 'Log out' })) && endSession(),
    },
  ]);

  $('#topbar').replaceChildren(
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Pulse home' }, h('img', { src: '/img/logo.svg', alt: '' }), h('span', {}, 'Pulse')),
    searchBox(),
    h('nav', { class: 'topnav', 'aria-label': 'Main' }, navLink(NAV[0]), navLink(NAV[1]), notificationHub(), navLink({ path: `/u/${me.username}`, label: 'Profile', icon: 'user' })),
    h(
      'div',
      { class: 'topbar-actions' },
      h('button', { class: 'btn btn-primary btn-sm compose-btn', type: 'button', onclick: openComposer }, icon('plus', 'icon-sm'), 'Post'),
      themeButton(),
      accountMenu
    )
  );
}

function renderDock() {
  const me = store.get('user');
  $('#dock').replaceChildren(
    navLink(NAV[0]),
    navLink(NAV[1]),
    h('button', { class: 'topnav-link compose-fab', type: 'button', 'aria-label': 'Create post', onclick: openComposer }, icon('plus')),
    navLink(NAV[2]),
    navLink({ path: `/u/${me.username}`, label: 'Profile', icon: 'user' })
  );
}

function renderLeft() {
  const me = store.get('user');
  const unread = store.get('unread');
  const sideLink = (path, label, iconName, extra) =>
    h('a', { href: `#${path}`, class: isActive(path) ? 'active' : '', dataset: { nav: path } }, icon(iconName), label, extra || null);

  $('#sidebar-left').replaceChildren(
    h(
      'section',
      { class: 'card mini-profile' },
      h('div', { class: 'mini-cover' }, me.banner ? h('img', { src: me.banner, alt: '' }) : null),
      avatar(me, 'lg'),
      h(
        'div',
        { class: 'mini-profile-body' },
        h('a', { href: `#/u/${me.username}` }, h('p', { class: 'mini-name' }, me.name)),
        h('p', { class: 'subtle', style: { margin: 0 } }, `@${me.username}`),
        h(
          'div',
          { class: 'mini-stats' },
          h('a', { class: 'stat', href: `#/u/${me.username}` }, h('strong', {}, compact(me.postsCount)), h('span', {}, 'Posts')),
          h('a', { class: 'stat', href: `#/u/${me.username}` }, h('strong', {}, compact(me.followersCount)), h('span', {}, 'Followers')),
          h('a', { class: 'stat', href: `#/u/${me.username}` }, h('strong', {}, compact(me.followingCount)), h('span', {}, 'Following'))
        )
      )
    ),
    h(
      'nav',
      { class: 'card side-nav', 'aria-label': 'Sections' },
      sideLink('/', 'Home', 'home'),
      sideLink('/following', 'Following', 'users'),
      sideLink('/search', 'Search', 'search'),
      sideLink('/activity', 'Activity', 'bell', unread > 0 ? h('span', { class: 'count-pill' }, unread > 99 ? '99+' : String(unread)) : null),
      sideLink(`/u/${me.username}`, 'Profile', 'user'),
      sideLink('/settings', 'Settings', 'settings')
    )
  );
}

function trendingCard() {
  const box = h('div', { class: 'trending-list' }, userRowSkeleton(), userRowSkeleton());
  api
    .trending()
    .then(({ tags }) =>
      box.replaceChildren(
        ...(tags.length
          ? tags.map((t, i) =>
              h(
                'a',
                { class: 'trend', href: `#/tag/${encodeURIComponent(t.tag)}` },
                h('span', { class: 'trend-rank' }, String(i + 1)),
                h('span', { class: 'trend-body' }, h('strong', {}, `#${t.tag}`), h('span', { class: 'subtle' }, `${compact(t.posts)} post${t.posts === 1 ? '' : 's'}`))
              )
            )
          : [h('p', { class: 'subtle', style: { margin: 0 } }, 'Use #hashtags in your posts to start a trend.')])
      )
    )
    .catch(() => box.replaceChildren(h('p', { class: 'subtle', style: { margin: 0 } }, 'Trends unavailable right now.')));
  return h('section', { class: 'card card-pad' }, h('h2', { class: 'card-title' }, icon('trending', 'icon-sm'), ' Trending'), box);
}

async function renderRight() {
  const list = h('div', { class: 'user-list' }, userRowSkeleton(), userRowSkeleton(), userRowSkeleton());
  $('#sidebar-right').replaceChildren(
    trendingCard(),
    h('section', { class: 'card card-pad' }, h('h2', { class: 'card-title' }, 'Who to follow'), list),
    h(
      'footer',
      { class: 'footer-links' },
      h('span', {}, '© ', String(new Date().getFullYear()), ' Pulse'),
      h('span', {}, 'Built for CodeAlpha'),
      h('a', { href: '#/settings' }, 'Settings')
    )
  );
  try {
    const { users } = await api.suggestions();
    list.replaceChildren(...(users.length ? users.map((u) => userRow(u)) : [h('p', { class: 'subtle', style: { margin: '0 10px' } }, 'You’re following everyone. Nice! 🎉')]));
  } catch {
    list.replaceChildren(h('p', { class: 'subtle', style: { margin: '0 10px' } }, 'Suggestions unavailable right now.'));
  }
}

let chromeFor = null;

function renderChrome({ layout, before }) {
  const app = layout === 'app' && store.get('user');
  for (const id of ['topbar', 'sidebar-left', 'sidebar-right', 'dock']) $(`#${id}`).hidden = !app;
  $('#shell').classList.toggle('auth-mode', !app);
  if (!app) {
    chromeFor = null;
    return;
  }
  const me = store.get('user');
  if (chromeFor !== me.id) {
    chromeFor = me.id;
    identity = `${me.username}|${me.name}|${me.avatar}|${me.banner}`;
    renderTopbar();
    renderDock();
    renderRight();
  }
  renderLeft();
  if (!before) {
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', isActive(a.dataset.nav)));
    $('#main').focus({ preventScroll: true });
  }
}

/* Live chrome updates ----------------------------------------------------- */
store.on('unread', () => {
  if (!store.get('user')) return;
  document.querySelectorAll('a[data-nav="/activity"]').forEach((a) => {
    a.querySelector('.badge')?.remove();
    if (a.classList.contains('topnav-link')) {
      const b = badge();
      if (b) a.append(b);
    }
  });
  renderLeft();
});

// Counter changes only touch the sidebar; identity changes (name, avatar, handle)
// rebuild the topbar too. This keeps an open search dropdown intact while following.
let identity = '';
store.on('user', (me) => {
  if (!me || chromeFor !== me.id) return;
  const next = `${me.username}|${me.name}|${me.avatar}|${me.banner}`;
  if (next !== identity) {
    identity = next;
    renderTopbar();
    renderDock();
  }
  renderLeft();
});

listen('follow:changed', () => setTimeout(renderLeft, 0));
listen('rt:notification', () => {
  if (currentPath() !== '/activity') toast.info('You have new activity 🔔');
});

// Floating nav hides while scrolling down and returns when scrolling up.
let lastY = 0;
window.addEventListener(
  'scroll',
  () => {
    const y = window.scrollY;
    const bar = $('#topbar');
    bar.classList.toggle('is-hidden', y > lastY && y > 160 && !bar.contains(document.activeElement));
    lastY = y;
  },
  { passive: true }
);

/* Boot -------------------------------------------------------------------- */
setUnauthorizedHandler(() => {
  if (!store.get('user')) return;
  endSession({ expired: true });
  toast.error('Your session has expired. Please log in again.');
});

onAfterRender(renderChrome);

async function boot() {
  const token = tokenStore.get();
  if (token) {
    try {
      const { user, unread } = await api.me();
      startSession({ token, user, unread }, { redirect: false });
    } catch {
      tokenStore.set(null);
    }
  }
  await startRouter();
}

boot();
