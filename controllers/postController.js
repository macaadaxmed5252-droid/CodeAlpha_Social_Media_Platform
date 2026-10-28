const Post = require('../models/Post');
const User = require('../models/User');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../utils/realtime');
const { cleanText, isObjectId, assertObjectId } = require('../utils/sanitize');
const { saveMedia, removeFile } = require('../utils/files');
const { normalizeTag } = require('../utils/hashtags');
const { serializePost, serializePosts, serializeUsers, likedSet } = require('../utils/serialize');
const { notify, retract } = require('../utils/notify');
const { findByUsername } = require('./userController');

const AUTHOR_FIELDS = 'username name avatar bio';
const PAGE_SIZE = 10;
const MEDIA_KINDS = { allow: ['image', 'video'] };

/** Cursor pagination on _id (ObjectIds are time-ordered), newest first. */
async function paginate(filter, cursor, viewerId) {
  const query = { ...filter };
  if (cursor !== undefined && cursor !== '') {
    if (!isObjectId(cursor)) throw new AppError('Invalid cursor', 400);
    query._id = { $lt: cursor };
  }
  const posts = await Post.find(query).sort({ _id: -1 }).limit(PAGE_SIZE + 1).populate('author', AUTHOR_FIELDS).lean();
  const page = posts.slice(0, PAGE_SIZE).filter((p) => p.author);
  return {
    posts: await serializePosts(page, viewerId),
    nextCursor: posts.length > PAGE_SIZE ? posts[PAGE_SIZE - 1]._id.toString() : null,
  };
}

function broadcastStats(post) {
  realtime.broadcast('post:stats', {
    id: post._id.toString(),
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
  });
}

async function loadOwnPost(req) {
  const id = assertObjectId(req.params.id, 'Post');
  const post = await Post.findById(id);
  if (!post) throw new AppError('Post not found', 404);
  if (!post.author.equals(req.user._id)) throw new AppError('You can only modify your own posts', 403);
  return post;
}

async function loadPostRef(id) {
  assertObjectId(id, 'Post');
  const post = await Post.findById(id).select('author likesCount commentsCount').lean();
  if (!post) throw new AppError('Post not found', 404);
  return post;
}

/* Feeds ------------------------------------------------------------------ */

exports.feed = asyncHandler(async (req, res) => {
  // "For You" is the global, newest-first stream; "Following" is personalised.
  const mode = req.query.mode === 'following' ? 'following' : 'foryou';
  let filter = {};
  if (mode === 'following') {
    if (!req.user) throw new AppError('Please log in to see your feed', 401);
    const followed = await Follow.find({ follower: req.user._id }).distinct('following');
    filter = { author: { $in: [req.user._id, ...followed] } };
  }
  const page = await paginate(filter, req.query.cursor, req.user?._id);
  res.json({ success: true, mode, ...page });
});

exports.userPosts = asyncHandler(async (req, res) => {
  const user = await findByUsername(req.params.username);
  const page = await paginate({ author: user._id }, req.query.cursor, req.user?._id);
  res.json({ success: true, ...page });
});

exports.byTag = asyncHandler(async (req, res) => {
  const tag = normalizeTag(req.params.tag);
  if (!tag) throw new AppError('Invalid hashtag', 400);
  const [page, total] = await Promise.all([
    paginate({ hashtags: tag }, req.query.cursor, req.user?._id),
    req.query.cursor ? null : Post.countDocuments({ hashtags: tag }),
  ]);
  res.json({ success: true, tag, total, ...page });
});

exports.search = asyncHandler(async (req, res) => {
  const q = cleanText(req.query.q).slice(0, 100);
  if (!q) return res.json({ success: true, posts: [], nextCursor: null });
  const tag = q.startsWith('#') ? normalizeTag(q) : null;
  // Hashtag queries use the hashtag index; keywords use the MongoDB text index.
  const filter = tag ? { hashtags: tag } : { $text: { $search: q } };
  const page = await paginate(filter, req.query.cursor, req.user?._id);
  res.json({ success: true, query: q, ...page });
});

exports.trending = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const rows = await Post.aggregate([
    { $match: { createdAt: { $gte: since }, 'hashtags.0': { $exists: true } } },
    { $unwind: '$hashtags' },
    { $group: { _id: '$hashtags', posts: { $sum: 1 }, engagement: { $sum: { $add: ['$likesCount', '$commentsCount'] } } } },
    { $sort: { posts: -1, engagement: -1, _id: 1 } },
    { $limit: 8 },
  ]);
  res.json({ success: true, tags: rows.map((r) => ({ tag: r._id, posts: r.posts })) });
});

/* CRUD ------------------------------------------------------------------- */

exports.getPost = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'Post');
  const post = await Post.findById(id).populate('author', AUTHOR_FIELDS).lean();
  if (!post || !post.author) throw new AppError('Post not found', 404);
  const liked = await likedSet(req.user?._id, [post._id]);
  res.json({ success: true, post: serializePost(post, { liked: liked.has(id), viewerId: req.user?._id }) });
});

exports.createPost = asyncHandler(async (req, res) => {
  const text = cleanText(req.body.text, { multiline: true });
  if (!text && !req.file) throw new AppError('Write something or add a photo or video', 422, { text: 'Write something or add a photo or video' });
  if (text.length > 2000) throw new AppError('Posts cannot exceed 2000 characters', 422, { text: 'Posts cannot exceed 2000 characters' });

  const media = req.file ? await saveMedia(req.file, 'posts', MEDIA_KINDS) : null;
  let post;
  try {
    post = await Post.create({ author: req.user._id, text, media });
  } catch (err) {
    await removeFile(media?.url);
    throw err;
  }
  await User.updateOne({ _id: req.user._id }, { $inc: { postsCount: 1 } });
  await post.populate('author', AUTHOR_FIELDS);

  // Let open tabs know there is something new; followers get a personal ping.
  const payload = { id: post._id.toString(), authorId: req.user._id.toString() };
  realtime.broadcast('post:new', payload);
  Follow.find({ following: req.user._id })
    .distinct('follower')
    .then((ids) => ids.forEach((id) => realtime.notifyUser(id, 'feed:new', payload)))
    .catch(() => {});

  res.status(201).json({ success: true, post: serializePost(post, { viewerId: req.user._id }) });
});

exports.updatePost = asyncHandler(async (req, res) => {
  const post = await loadOwnPost(req);
  const oldMediaUrl = post.media?.url || '';

  if (req.body.text !== undefined) post.text = cleanText(req.body.text, { multiline: true });
  let newMedia = null;
  if (req.file) newMedia = post.media = await saveMedia(req.file, 'posts', MEDIA_KINDS);
  else if (req.body.removeMedia === 'true' || req.body.removeMedia === true) post.media = null;

  if (!post.text && !post.media?.url) {
    await removeFile(newMedia?.url);
    throw new AppError('A post needs some text or media', 422, { text: 'A post needs some text or media' });
  }
  if (post.text.length > 2000) {
    await removeFile(newMedia?.url);
    throw new AppError('Posts cannot exceed 2000 characters', 422, { text: 'Posts cannot exceed 2000 characters' });
  }
  if (post.isModified()) post.editedAt = new Date();

  try {
    await post.save();
  } catch (err) {
    await removeFile(newMedia?.url);
    throw err;
  }
  if (oldMediaUrl && oldMediaUrl !== (post.media?.url || '')) await removeFile(oldMediaUrl);

  await post.populate('author', AUTHOR_FIELDS);
  const liked = await likedSet(req.user._id, [post._id]);
  const serialized = serializePost(post, { liked: liked.has(post._id.toString()), viewerId: req.user._id });
  realtime.broadcast('post:updated', { id: serialized.id });
  res.json({ success: true, post: serialized });
});

exports.deletePost = asyncHandler(async (req, res) => {
  const post = await loadOwnPost(req);
  await Promise.all([
    post.deleteOne(),
    Like.deleteMany({ post: post._id }),
    Comment.deleteMany({ post: post._id }),
    Notification.deleteMany({ post: post._id }),
    User.updateOne({ _id: post.author, postsCount: { $gt: 0 } }, { $inc: { postsCount: -1 } }),
  ]);
  await removeFile(post.media?.url);
  realtime.broadcast('post:deleted', { id: post._id.toString() });
  res.json({ success: true, id: post._id.toString() });
});

/* Likes ------------------------------------------------------------------ */

exports.likePost = asyncHandler(async (req, res) => {
  const post = await loadPostRef(req.params.id);
  const me = req.user._id;
  // The unique (post, user) index makes this idempotent under double-clicks.
  let created = false;
  try {
    await Like.create({ post: post._id, user: me });
    created = true;
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  let likesCount = post.likesCount;
  if (created) {
    const updated = await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: 1 } }, { new: true }).select('likesCount commentsCount');
    likesCount = updated.likesCount;
    broadcastStats(updated);
    await notify({ recipient: post.author, actor: me, type: 'like', post: post._id });
  }
  res.json({ success: true, liked: true, likesCount });
});

exports.unlikePost = asyncHandler(async (req, res) => {
  const post = await loadPostRef(req.params.id);
  const me = req.user._id;
  const removed = await Like.findOneAndDelete({ post: post._id, user: me });

  let likesCount = post.likesCount;
  if (removed) {
    const updated = await Post.findOneAndUpdate(
      { _id: post._id, likesCount: { $gt: 0 } },
      { $inc: { likesCount: -1 } },
      { new: true }
    ).select('likesCount commentsCount');
    if (updated) {
      likesCount = updated.likesCount;
      broadcastStats(updated);
    }
    await retract({ recipient: post.author, actor: me, type: 'like', post: post._id });
  }
  res.json({ success: true, liked: false, likesCount });
});

exports.likers = asyncHandler(async (req, res) => {
  const post = await loadPostRef(req.params.id);
  const rows = await Like.find({ post: post._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('user', `${AUTHOR_FIELDS} followersCount`)
    .lean();
  const users = await serializeUsers(rows.map((r) => r.user).filter(Boolean), req.user?._id);
  res.json({ success: true, users });
});

exports.broadcastStats = broadcastStats;
