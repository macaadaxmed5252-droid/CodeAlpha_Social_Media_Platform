import { store } from './store.js';

/**
 * Hash router. Views are `(params, ctx) => HTMLElement | Promise<HTMLElement>`;
 * they may register teardown work with `ctx.onLeave(fn)`.
 */
const routes = [];
let cleanups = [];
let renderToken = 0;
let afterRender = () => {};

export function route(pattern, view, { auth = true, guestOnly = false, layout = 'app' } = {}) {
  const keys = [];
  const regex = new RegExp(
    `^${pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    })}/?$`
  );
  routes.push({ regex, keys, view, auth, guestOnly, layout });
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) return render();
  if (replace) location.replace(target);
  else location.hash = target;
}

export function currentPath() {
  return location.hash.slice(1).split('?')[0] || '/';
}

export function currentQuery() {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}

export function onAfterRender(fn) {
  afterRender = fn;
}

export async function render() {
  const path = currentPath();
  const match = routes.map((r) => ({ r, m: path.match(r.regex) })).find((x) => x.m);
  const loggedIn = Boolean(store.get('user'));

  if (!match) return navigate(loggedIn ? '/' : '/login', { replace: true });
  const { r, m } = match;
  if (r.auth && !loggedIn) return navigate('/login', { replace: true });
  if (r.guestOnly && loggedIn) return navigate('/', { replace: true });

  cleanups.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore teardown errors */
    }
  });
  cleanups = [];

  const token = ++renderToken;
  let params = {};
  try {
    params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  } catch {
    return navigate('/', { replace: true });
  }
  const ctx = { onLeave: (fn) => cleanups.push(fn), query: currentQuery(), isCurrent: () => token === renderToken };

  afterRender({ path, layout: r.layout, before: true });
  const main = document.getElementById('main');
  const el = await r.view(params, ctx);
  if (token !== renderToken) return; // a newer navigation won the race
  main.replaceChildren(el);
  window.scrollTo({ top: 0, behavior: 'instant' });
  afterRender({ path, layout: r.layout });
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  return render();
}
