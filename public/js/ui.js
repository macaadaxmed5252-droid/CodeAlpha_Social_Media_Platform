import { h, icon, $, clear } from './dom.js';

/* Toasts ------------------------------------------------------------------ */
const TOAST_ICONS = { success: 'check', error: 'alert', info: 'info' };

export function toast(message, type = 'info', duration = 3500) {
  const root = $('#toasts');
  const close = () => {
    if (el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const el = h(
    'div',
    { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-icon' }, icon(TOAST_ICONS[type] || 'info')),
    h('div', { class: 'toast-msg' }, message),
    h('button', { class: 'btn-icon toast-close', 'aria-label': 'Dismiss', onclick: close }, icon('x', 'icon-sm')),
    h('span', { class: 'toast-progress', style: { animationDuration: `${duration}ms` } })
  );
  root.append(el);
  while (root.children.length > 4) root.firstElementChild.remove();
  setTimeout(close, duration);
}
toast.success = (m) => toast(m, 'success');
toast.error = (m) => toast(m, 'error', 5000);
toast.info = (m) => toast(m, 'info');

/* Modal ------------------------------------------------------------------- */
let openModals = 0;

export function modal({ title, body, footer, size = '', onClose } = {}) {
  const root = $('#modal-root');
  const previouslyFocused = document.activeElement;
  const dialog = h(
    'div',
    { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', {}, title),
      h('button', { class: 'btn-icon', 'aria-label': 'Close', onclick: () => close() }, icon('x'))
    ),
    h('div', { class: 'modal-body' }, body),
    footer ? h('div', { class: 'modal-foot' }, footer) : null
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') trapFocus(e, dialog);
  }
  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('closing');
    backdrop.addEventListener(
      'animationend',
      () => {
        backdrop.remove();
        if (--openModals === 0) document.body.style.overflow = '';
        previouslyFocused?.focus?.();
      },
      { once: true }
    );
    onClose?.(result);
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  root.append(backdrop);
  openModals += 1;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => (dialog.querySelector('[autofocus], input, textarea, button.btn') || dialog).focus());
  return { close, el: dialog };
}

function trapFocus(e, container) {
  const focusables = [...container.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')];
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function confirmDialog({ title = 'Are you sure?', message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => ((answer = true), m.close()) }, confirmText);
    const cancel = h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancel');
    const m = modal({
      title,
      size: 'modal-sm',
      body: h('p', { class: 'muted', style: { margin: 0 } }, message),
      footer: [cancel, ok],
      onClose: () => resolve(answer),
    });
    requestAnimationFrame(() => ok.focus());
  });
}

export function lightbox(src) {
  const el = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Image preview' }, h('img', { src, alt: '' }));
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  el.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(el);
}

/* Dropdown menu ----------------------------------------------------------- */
export function dropdown(trigger, items) {
  const wrap = h('div', { class: 'menu-wrap' }, trigger);
  let menu = null;
  const hide = () => {
    menu?.remove();
    menu = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey);
  };
  const outside = (e) => !wrap.contains(e.target) && hide();
  const onKey = (e) => e.key === 'Escape' && (hide(), trigger.focus());

  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) return hide();
    menu = h(
      'div',
      { class: 'menu', role: 'menu' },
      items.map((item) =>
        h(
          'button',
          {
            role: 'menuitem',
            class: item.danger ? 'danger' : '',
            onclick: () => {
              hide();
              item.onSelect();
            },
          },
          icon(item.icon, 'icon-sm'),
          item.label
        )
      )
    );
    wrap.append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', onKey);
  });
  return wrap;
}

/* Buttons ----------------------------------------------------------------- */
export function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
  btn.setAttribute('aria-busy', loading ? 'true' : 'false');
}

/* Form errors ------------------------------------------------------------- */
export function showFieldErrors(form, details = {}) {
  form.querySelectorAll('.field').forEach((f) => {
    f.classList.remove('has-error');
    const err = f.querySelector('.field-error');
    if (err) err.textContent = '';
  });
  for (const [name, message] of Object.entries(details)) {
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    const field = input?.closest('.field');
    if (!field) continue;
    field.classList.add('has-error');
    const err = field.querySelector('.field-error');
    if (err) err.textContent = message;
  }
  form.querySelector('.has-error input, .has-error textarea')?.focus();
}

export function field({ label, name, type = 'text', value = '', hint, textarea = false, ...rest }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const control = textarea
    ? h('textarea', { class: 'textarea', id, name, ...rest }, value)
    : h('input', { class: 'input', id, name, type, value, ...rest });
  let inner = control;
  if (type === 'password') {
    const toggle = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Show password' }, icon('eye', 'icon-sm'));
    toggle.addEventListener('click', () => {
      const show = control.type === 'password';
      control.type = show ? 'text' : 'password';
      toggle.replaceChildren(icon(show ? 'eyeOff' : 'eye', 'icon-sm'));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    inner = h('div', { class: 'input-wrap' }, control, toggle);
  }
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    inner,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
    h('span', { class: 'field-error', 'aria-live': 'polite' })
  );
}

/* Skeletons --------------------------------------------------------------- */
const sk = (cls, style = {}) => h('div', { class: `skeleton ${cls}`, style });

export function postSkeleton() {
  return h(
    'div',
    { class: 'card post', 'aria-hidden': 'true' },
    h('div', { class: 'sk-row' }, sk('sk-circle', { width: '44px', height: '44px' }), h('div', { class: 'sk-stack' }, sk('sk-line', { width: '35%' }), sk('sk-line', { width: '20%', height: '10px' }))),
    h('div', { class: 'sk-stack', style: { marginTop: '16px' } }, sk('sk-line', { width: '95%' }), sk('sk-line', { width: '80%' }), sk('sk-line', { width: '55%' })),
    sk('', { height: '220px', marginTop: '14px', borderRadius: '16px' }),
    h('div', { class: 'sk-row', style: { margin: '14px 0 6px' } }, sk('sk-line', { width: '56px', height: '20px' }), sk('sk-line', { width: '56px', height: '20px' }))
  );
}

export function postSkeletons(n = 3) {
  return h('div', { class: 'view skeleton-list', 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: n }, postSkeleton));
}

export function userRowSkeleton() {
  return h(
    'div',
    { class: 'user-row', 'aria-hidden': 'true' },
    sk('sk-circle', { width: '40px', height: '40px' }),
    h('div', { class: 'sk-stack' }, sk('sk-line', { width: '60%' }), sk('sk-line', { width: '40%', height: '10px' }))
  );
}

export function profileSkeleton() {
  return h(
    'div',
    { class: 'card profile-card', 'aria-hidden': 'true' },
    sk('', { height: '180px', borderRadius: 0 }),
    h(
      'div',
      { class: 'profile-body' },
      h('div', { class: 'profile-top' }, sk('sk-circle', { width: '120px', height: '120px', border: '5px solid var(--surface)' })),
      h('div', { class: 'sk-stack', style: { marginTop: '16px' } }, sk('sk-line', { width: '40%', height: '20px' }), sk('sk-line', { width: '25%' }), sk('sk-line', { width: '70%', marginTop: '8px' }))
    )
  );
}

export function emptyState({ iconName = 'sparkles', title, text, action }) {
  return h(
    'div',
    { class: 'card empty' },
    h('div', { class: 'empty-art' }, icon(iconName)),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    action || null
  );
}

export function errorState(err, retry) {
  return emptyState({
    iconName: 'alert',
    title: 'Something went wrong',
    text: err?.message || 'Please try again.',
    action: retry ? h('button', { class: 'btn btn-outline', onclick: retry }, 'Try again') : null,
  });
}

export function replace(el, ...children) {
  clear(el);
  children.forEach((c) => c && el.append(c));
  return el;
}

/* Password strength checklist ---------------------------------------------- */
const PASSWORD_RULES = [
  { test: (pw) => pw.length >= 8, label: 'At least 8 characters', required: true },
  { test: (pw) => /[A-Za-z]/.test(pw), label: 'Contains a letter', required: true },
  { test: (pw) => /\d/.test(pw), label: 'Contains a number', required: true },
  { test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: 'Upper & lower case (recommended)' },
  { test: (pw) => /[^A-Za-z0-9]/.test(pw), label: 'A symbol like ! ? # (recommended)' },
];

export const passwordMeetsRules = (pw) => PASSWORD_RULES.filter((r) => r.required).every((r) => r.test(pw));

/** Live strength meter + checklist that ticks rules off as the user types. */
export function passwordChecklist(input) {
  const meter = h('div', { class: 'pw-meter', dataset: { score: '0' }, 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span'));
  const label = h('span', { class: 'pw-label' });
  const items = PASSWORD_RULES.map((rule) => {
    const li = h('li', {}, icon('circle', 'icon-sm'), rule.label);
    return { rule, li };
  });
  const el = h('div', { class: 'pw-check' }, h('div', { class: 'pw-meter-row' }, meter, label), h('ul', { class: 'pw-rules', 'aria-live': 'polite' }, items.map((i) => i.li)));

  const update = () => {
    const pw = input.value;
    let passed = 0;
    for (const { rule, li } of items) {
      const ok = rule.test(pw);
      if (ok) passed += 1;
      if (li.classList.contains('ok') !== ok) {
        li.classList.toggle('ok', ok);
        li.firstChild.replaceWith(icon(ok ? 'checkCircle' : 'circle', 'icon-sm'));
      }
    }
    const score = !pw ? 0 : !passwordMeetsRules(pw) ? 1 : passed === 3 ? 2 : passed === 4 ? 3 : 4;
    meter.dataset.score = String(score);
    label.textContent = ['', 'Weak', 'Fair', 'Good', 'Strong'][score];
    label.dataset.score = String(score);
  };
  input.addEventListener('input', update);
  update();
  return el;
}
