import { h, icon } from '../dom.js';
import { api } from '../api.js';
import { field, setLoading, showFieldErrors, toast } from '../ui.js';
import { startSession } from '../session.js';

function hero() {
  return h(
    'section',
    { class: 'auth-hero' },
    h('a', { class: 'brand', href: '#/login' }, h('img', { src: '/img/logo.svg', alt: '' }), h('span', {}, 'Pulse')),
    h(
      'div',
      {},
      h('h1', {}, 'Where your moments find their people.'),
      h('p', {}, 'Share what you’re up to, follow friends and creators, and keep the conversation going - all in real time.')
    ),
    h(
      'div',
      { class: 'auth-bubbles', 'aria-hidden': 'true' },
      h('div', { class: 'auth-bubble' }, icon('heart'), 'Amina liked your photo'),
      h('div', { class: 'auth-bubble' }, icon('comment'), 'Omar: “This is amazing! 🔥”'),
      h('div', { class: 'auth-bubble' }, icon('users'), '12 new followers this week')
    )
  );
}

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score += 1;
  return pw ? Math.max(1, score) : 0;
}

function shell(card) {
  return h('div', { class: 'auth' }, hero(), h('section', { class: 'auth-panel' }, card));
}

export function loginView() {
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Log in');
  const form = h(
    'form',
    { class: 'form-stack', novalidate: true },
    field({ label: 'Email or username', name: 'identifier', autocomplete: 'username', required: true, autofocus: true }),
    field({ label: 'Password', name: 'password', type: 'password', autocomplete: 'current-password', required: true }),
    submit
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = {};
    if (!data.identifier.trim()) errors.identifier = 'Enter your email or username';
    if (!data.password) errors.password = 'Enter your password';
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    setLoading(submit, true);
    try {
      const res = await api.login(data);
      startSession(res);
      toast.success(`Welcome back, ${res.user.name.split(' ')[0]}! 👋`);
    } catch (err) {
      showFieldErrors(form, err.details && Object.keys(err.details).length ? err.details : { password: err.message });
    } finally {
      setLoading(submit, false);
    }
  });

  return shell(
    h(
      'div',
      { class: 'auth-card' },
      h('h2', {}, 'Welcome back'),
      h('p', { class: 'muted' }, 'Log in to catch up with your people.'),
      form,
      h('p', { class: 'auth-switch' }, 'New to Pulse? ', h('a', { href: '#/register' }, 'Create an account')),
      h('div', { class: 'demo-hint' }, 'Demo: run ', h('code', {}, 'npm run seed'), ' then log in as ', h('code', {}, 'amina'), ' / ', h('code', {}, 'Password123'))
    )
  );
}

export function registerView() {
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Create account');
  const meter = h('div', { class: 'pw-meter', dataset: { score: '0' }, 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span'));
  const pwField = field({
    label: 'Password',
    name: 'password',
    type: 'password',
    autocomplete: 'new-password',
    hint: 'At least 8 characters with a letter and a number',
    required: true,
  });
  pwField.querySelector('.input-wrap').after(meter);
  pwField.querySelector('input').addEventListener('input', (e) => (meter.dataset.score = passwordStrength(e.target.value)));

  const usernameField = field({ label: 'Username', name: 'username', autocomplete: 'username', maxlength: 20, required: true, hint: 'Letters, numbers and underscores' });
  const usernameInput = usernameField.querySelector('input');
  usernameInput.addEventListener('input', () => {
    const cleaned = usernameInput.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleaned !== usernameInput.value) usernameInput.value = cleaned;
  });

  const form = h(
    'form',
    { class: 'form-stack', novalidate: true },
    h(
      'div',
      { class: 'form-row' },
      field({ label: 'Display name', name: 'name', autocomplete: 'name', maxlength: 50, required: true, autofocus: true }),
      usernameField
    ),
    field({ label: 'Email', name: 'email', type: 'email', autocomplete: 'email', required: true }),
    pwField,
    submit
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = {};
    if (!data.name.trim()) errors.name = 'Display name is required';
    if (!/^[a-z0-9_]{3,20}$/.test(data.username)) errors.username = '3-20 letters, numbers or underscores';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) errors.email = 'Enter a valid email address';
    if (data.password.length < 8 || !/[A-Za-z]/.test(data.password) || !/\d/.test(data.password)) {
      errors.password = 'At least 8 characters with a letter and a number';
    }
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    setLoading(submit, true);
    try {
      const res = await api.register(data);
      startSession(res);
      toast.success('Welcome to Pulse! 🎉 Follow a few people to fill your feed.');
    } catch (err) {
      if (err.details && Object.keys(err.details).length) showFieldErrors(form, err.details);
      else toast.error(err.message);
    } finally {
      setLoading(submit, false);
    }
  });

  return shell(
    h(
      'div',
      { class: 'auth-card' },
      h('h2', {}, 'Create your account'),
      h('p', { class: 'muted' }, 'It takes less than a minute.'),
      form,
      h('p', { class: 'auth-switch' }, 'Already have an account? ', h('a', { href: '#/login' }, 'Log in'))
    )
  );
}
