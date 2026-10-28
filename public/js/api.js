const TOKEN_KEY = 'pulse:token';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode) - session lasts for this tab only */
    }
  },
};

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('Network error - check your connection', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data.details);
  }
  return data;
}

const enc = encodeURIComponent;
const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  register: (data) => request('POST', '/auth/register', data),
  login: (data) => request('POST', '/auth/login', data),
  me: () => request('GET', '/auth/me'),
  changePassword: (data) => request('PATCH', '/auth/password', data),

  // users
  profile: (username) => request('GET', `/users/${enc(username)}`),
  updateMe: (formData) => request('PATCH', '/users/me', formData),
  searchUsers: (q) => request('GET', `/users/search${qs({ q })}`),
  suggestions: () => request('GET', '/users/suggestions'),
  followers: (username, page) => request('GET', `/users/${enc(username)}/followers${qs({ page })}`),
  following: (username, page) => request('GET', `/users/${enc(username)}/following${qs({ page })}`),
  follow: (username) => request('POST', `/users/${enc(username)}/follow`),
  unfollow: (username) => request('DELETE', `/users/${enc(username)}/follow`),
  userPosts: (username, cursor) => request('GET', `/users/${enc(username)}/posts${qs({ cursor })}`),

  // posts
  feed: (mode, cursor) => request('GET', `/posts/feed${qs({ mode, cursor })}`),
  searchPosts: (q, cursor) => request('GET', `/posts/search${qs({ q, cursor })}`),
  tagPosts: (tag, cursor) => request('GET', `/posts/tag/${enc(tag)}${qs({ cursor })}`),
  trending: () => request('GET', '/posts/trending'),
  post: (id) => request('GET', `/posts/${enc(id)}`),
  createPost: (formData) => request('POST', '/posts', formData),
  updatePost: (id, formData) => request('PATCH', `/posts/${enc(id)}`, formData),
  deletePost: (id) => request('DELETE', `/posts/${enc(id)}`),
  like: (id) => request('POST', `/posts/${enc(id)}/like`),
  unlike: (id) => request('DELETE', `/posts/${enc(id)}/like`),
  likers: (id) => request('GET', `/posts/${enc(id)}/likes`),

  // comments
  comments: (postId) => request('GET', `/posts/${enc(postId)}/comments`),
  addComment: (postId, data) => request('POST', `/posts/${enc(postId)}/comments`, data),
  deleteComment: (postId, commentId) => request('DELETE', `/posts/${enc(postId)}/comments/${enc(commentId)}`),

  // activity
  notifications: (cursor, limit) => request('GET', `/notifications${qs({ cursor, limit })}`),
  markAllRead: () => request('PATCH', '/notifications/read'),
};
