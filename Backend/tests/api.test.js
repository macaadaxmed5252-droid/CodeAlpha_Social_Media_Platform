process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');
const { connectDB } = require('../config/db');
const { UPLOAD_ROOT } = require('../utils/files');

const TEST_DB = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/codealpha_social_test_tmp';
const api = request(app);

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const createdFiles = [];

async function register(username) {
  const res = await api.post('/api/auth/register').send({
    name: username.toUpperCase(),
    username,
    email: `${username}@example.com`,
    password: 'Password123',
  });
  assert.equal(res.status, 201, res.body.message);
  return { token: res.body.token, user: res.body.user };
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

let alice;
let bob;

before(async () => {
  await connectDB(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  alice = await register('alice');
  bob = await register('bob');
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const url of createdFiles) fs.rmSync(path.join(UPLOAD_ROOT, url.replace('/uploads/', '')), { force: true });
});

describe('auth', () => {
  test('rejects weak passwords and bad usernames', async () => {
    const res = await api.post('/api/auth/register').send({ name: 'X', username: 'a!', email: 'bad', password: 'short' });
    assert.equal(res.status, 422);
    assert.ok(res.body.details.username && res.body.details.email && res.body.details.password);
  });

  test('rejects duplicate username', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'A2', username: 'alice', email: 'other@example.com', password: 'Password123' });
    assert.equal(res.status, 409);
    assert.equal(res.body.details.username, 'That username is taken');
  });

  test('never returns the password hash', async () => {
    const res = await api.post('/api/auth/login').send({ identifier: 'alice@example.com', password: 'Password123' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.user.email, undefined);
  });

  test('login by username, wrong password gives a generic error', async () => {
    assert.equal((await api.post('/api/auth/login').send({ identifier: '@bob', password: 'Password123' })).status, 200);
    const bad = await api.post('/api/auth/login').send({ identifier: 'bob', password: 'nope12345' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.message, 'Invalid credentials');
  });

  test('blocks NoSQL operator injection on login', async () => {
    const res = await api.post('/api/auth/login').send({ identifier: { $ne: null }, password: { $ne: null } });
    assert.notEqual(res.status, 200);
  });

  test('protected routes require a valid token', async () => {
    assert.equal((await api.get('/api/auth/me')).status, 401);
    assert.equal((await api.get('/api/auth/me').set(auth('garbage'))).status, 401);
    const me = await api.get('/api/auth/me').set(auth(alice.token));
    assert.equal(me.body.user.username, 'alice');
  });

  test('change password', async () => {
    const wrong = await api.patch('/api/auth/password').set(auth(bob.token)).send({ currentPassword: 'x', newPassword: 'NewPass123' });
    assert.equal(wrong.status, 401);
    const ok = await api
      .patch('/api/auth/password')
      .set(auth(bob.token))
      .send({ currentPassword: 'Password123', newPassword: 'NewPass123' });
    assert.equal(ok.status, 200);
    assert.equal((await api.post('/api/auth/login').send({ identifier: 'bob', password: 'NewPass123' })).status, 200);
  });
});

describe('profiles', () => {
  test('update bio, website and avatar', async () => {
    const res = await api
      .patch('/api/users/me')
      .set(auth(alice.token))
      .field('bio', 'Hello\u0000 <b>world</b>')
      .field('website', 'alice.dev')
      .attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.user.bio, 'Hello <b>world</b>');
    assert.equal(res.body.user.website, 'https://alice.dev/');
    assert.match(res.body.user.avatar, /^\/uploads\/avatars\/.+\.png$/);
    createdFiles.push(res.body.user.avatar);
    assert.equal((await api.get(res.body.user.avatar)).status, 200);
  });

  test('rejects files that are not really images', async () => {
    const res = await api
      .patch('/api/users/me')
      .set(auth(alice.token))
      .attach('avatar', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    assert.equal(res.status, 415);
  });

  test('public profile lookup and 404', async () => {
    const res = await api.get('/api/users/alice');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'alice');
    assert.equal((await api.get('/api/users/nobody_here')).status, 404);
  });

  test('search users', async () => {
    const res = await api.get('/api/users/search?q=bo').set(auth(alice.token));
    assert.deepEqual(res.body.users.map((u) => u.username), ['bob']);
    assert.equal((await api.get('/api/users/search?q=.*')).body.users.length, 0);
  });
});

describe('follow system', () => {
  test('follow is idempotent and updates counts', async () => {
    const first = await api.post('/api/users/bob/follow').set(auth(alice.token));
    assert.equal(first.status, 201);
    const again = await api.post('/api/users/bob/follow').set(auth(alice.token));
    assert.equal(again.status, 200);
    assert.equal(again.body.followersCount, 1);

    const profile = await api.get('/api/users/bob').set(auth(alice.token));
    assert.equal(profile.body.user.isFollowing, true);
    assert.equal((await api.get('/api/users/alice')).body.user.followingCount, 1);

    const followers = await api.get('/api/users/bob/followers');
    assert.deepEqual(followers.body.users.map((u) => u.username), ['alice']);
  });

  test('cannot follow yourself', async () => {
    assert.equal((await api.post('/api/users/alice/follow').set(auth(alice.token))).status, 400);
  });

  test('follow creates an activity item for the target', async () => {
    const res = await api.get('/api/notifications').set(auth(bob.token));
    assert.equal(res.body.notifications[0].type, 'follow');
    assert.equal(res.body.notifications[0].actor.username, 'alice');
  });

  test('unfollow decrements and retracts the activity item', async () => {
    await api.post('/api/users/alice/follow').set(auth(bob.token));
    const res = await api.delete('/api/users/bob/follow').set(auth(alice.token));
    assert.equal(res.body.followersCount, 0);
    const again = await api.delete('/api/users/bob/follow').set(auth(alice.token));
    assert.equal(again.body.followersCount, 0);
    const notes = await api.get('/api/notifications').set(auth(bob.token));
    assert.equal(notes.body.notifications.filter((n) => n.type === 'follow').length, 0);
    await api.post('/api/users/bob/follow').set(auth(alice.token));
  });
});

describe('posts, likes and comments', () => {
  let postId;

  test('create text + image post', async () => {
    const res = await api
      .post('/api/posts')
      .set(auth(bob.token))
      .field('text', 'First post!')
      .attach('image', PNG, { filename: 'p.png', contentType: 'image/png' });
    assert.equal(res.status, 201, res.body.message);
    postId = res.body.post.id;
    createdFiles.push(res.body.post.image);
    assert.equal(res.body.post.isMine, true);
    assert.equal((await api.get('/api/users/bob')).body.user.postsCount, 1);
  });

  test('empty posts are rejected', async () => {
    assert.equal((await api.post('/api/posts').set(auth(bob.token)).send({ text: '   ' })).status, 422);
  });

  test('following feed includes followed authors, explore is public', async () => {
    const feed = await api.get('/api/posts/feed?mode=following').set(auth(alice.token));
    assert.equal(feed.body.posts[0].id, postId);
    assert.equal(feed.body.posts[0].author.username, 'bob');
    assert.equal((await api.get('/api/posts/feed?mode=following')).status, 401);
    assert.equal((await api.get('/api/posts/feed?mode=explore')).body.posts.length, 1);
  });

  test('cursor pagination', async () => {
    for (let i = 0; i < 11; i += 1) await api.post('/api/posts').set(auth(alice.token)).send({ text: `post ${i}` });
    const page1 = await api.get('/api/posts/feed?mode=explore');
    assert.equal(page1.body.posts.length, 10);
    assert.ok(page1.body.nextCursor);
    const page2 = await api.get(`/api/posts/feed?mode=explore&cursor=${page1.body.nextCursor}`);
    assert.equal(page2.body.posts.length, 2);
    assert.equal(page2.body.nextCursor, null);
    assert.equal((await api.get('/api/posts/feed?mode=explore&cursor=zzz')).status, 400);
  });

  test('like toggle is idempotent', async () => {
    const a = await api.post(`/api/posts/${postId}/like`).set(auth(alice.token));
    const b = await api.post(`/api/posts/${postId}/like`).set(auth(alice.token));
    assert.equal(a.body.likesCount, 1);
    assert.equal(b.body.likesCount, 1);
    const post = await api.get(`/api/posts/${postId}`).set(auth(alice.token));
    assert.equal(post.body.post.likedByMe, true);
    const likers = await api.get(`/api/posts/${postId}/likes`);
    assert.deepEqual(likers.body.users.map((u) => u.username), ['alice']);

    const un = await api.delete(`/api/posts/${postId}/like`).set(auth(alice.token));
    assert.equal(un.body.likesCount, 0);
    assert.equal((await api.delete(`/api/posts/${postId}/like`).set(auth(alice.token))).body.likesCount, 0);
    await api.post(`/api/posts/${postId}/like`).set(auth(alice.token));
  });

  test('only the author may edit or delete', async () => {
    assert.equal((await api.patch(`/api/posts/${postId}`).set(auth(alice.token)).send({ text: 'hijack' })).status, 403);
    assert.equal((await api.delete(`/api/posts/${postId}`).set(auth(alice.token))).status, 403);
    const res = await api.patch(`/api/posts/${postId}`).set(auth(bob.token)).send({ text: 'Edited post' });
    assert.equal(res.status, 200);
    assert.equal(res.body.post.text, 'Edited post');
    assert.ok(res.body.post.editedAt);
    assert.equal(res.body.post.likedByMe, false);
  });

  test('invalid ids give 404 not 500', async () => {
    assert.equal((await api.get('/api/posts/not-an-id')).status, 404);
    assert.equal((await api.get('/api/posts/507f1f77bcf86cd799439011')).status, 404);
  });

  let commentId;
  test('comments and one-level replies', async () => {
    const c = await api.post(`/api/posts/${postId}/comments`).set(auth(alice.token)).send({ text: 'Nice!' });
    assert.equal(c.status, 201);
    commentId = c.body.comment.id;
    const r = await api.post(`/api/posts/${postId}/comments`).set(auth(bob.token)).send({ text: 'Thanks', parentId: commentId });
    assert.equal(r.body.comment.parent, commentId);
    const rr = await api.post(`/api/posts/${postId}/comments`).set(auth(alice.token)).send({ text: 'np', parentId: r.body.comment.id });
    assert.equal(rr.body.comment.parent, commentId, 'reply-to-reply attaches to the root');
    assert.equal(rr.body.commentsCount, 3);

    const list = await api.get(`/api/posts/${postId}/comments`).set(auth(alice.token));
    assert.equal(list.body.comments.length, 3);
    assert.equal(list.body.comments[0].canDelete, true);
    assert.equal(list.body.comments[1].canDelete, false);
  });

  test('comment notifications reach the post author', async () => {
    const res = await api.get('/api/notifications').set(auth(bob.token));
    const types = res.body.notifications.map((n) => n.type);
    assert.ok(types.includes('comment') && types.includes('like'));
    const count = await api.get('/api/notifications/unread-count').set(auth(bob.token));
    assert.ok(count.body.unread > 0);
    await api.patch('/api/notifications/read').set(auth(bob.token));
    assert.equal((await api.get('/api/notifications/unread-count').set(auth(bob.token))).body.unread, 0);
  });

  test('deleting a root comment removes its replies', async () => {
    assert.equal((await api.post(`/api/posts/${postId}/comments`).set(auth(alice.token)).send({ text: ' ' })).status, 422);
    const res = await api.delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(bob.token));
    assert.equal(res.status, 200, 'post author can moderate');
    assert.equal(res.body.removed.length, 3);
    assert.equal(res.body.commentsCount, 0);
  });

  test('deleting a post cascades and cleans counters', async () => {
    const res = await api.delete(`/api/posts/${postId}`).set(auth(bob.token));
    assert.equal(res.status, 200);
    assert.equal((await api.get(`/api/posts/${postId}`)).status, 404);
    assert.equal((await api.get('/api/users/bob')).body.user.postsCount, 0);
    const notes = await api.get('/api/notifications').set(auth(bob.token));
    assert.equal(notes.body.notifications.filter((n) => n.post).length, 0);
  });
});

describe('misc', () => {
  test('unknown API routes return JSON 404', async () => {
    const res = await api.get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test('SPA shell and security headers', async () => {
    const res = await api.get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});
