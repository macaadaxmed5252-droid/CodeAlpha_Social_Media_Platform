const Post = require('../models/Post');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../utils/realtime');
const { cleanText, isObjectId, assertObjectId } = require('../utils/sanitize');
const { saveImage, removeImage } = require('../utils/files');
const { serializePost, serializePosts, serializeUsers, likedSet } = require('../utils/serialize');
const { notify, retract } = require('../utils/notify');
const { findByUsername } = require('./userController');

const AUTHOR_FIELDS = 'username name avatar bio';
const PAGE_SIZE = 10;

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
    nextCursor: posts.length > PAGE_SIZE ? page[page.length - 1]._id.toString() : null,
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

exports.feed = asyncHandler(async (req, res) => {
  const mode = req.query.mode === 'explore' ? 'explore' : 'following';
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

exports.getPost = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'Post');
  const post = await Post.findById(id).populate('author', AUTHOR_FIELDS).lean();
  if (!post || !post.author) throw new AppError('Post not found', 404);
  const liked = await likedSet(req.user?._id, [post._id]);
  res.json({ success: true, post: serializePost(post, { liked: liked.has(id), viewerId: req.user?._id }) });
});

exports.createPost = asyncHandler(async (req, res) => {
  const text = cleanText(req.body.text, { multiline: true });
  if (!text && !req.file) throw new AppError('Write something or add an image', 422, { text: 'Write something or add an image' });
  if (text.length > 2000) throw new AppError('Posts cannot exceed 2000 characters', 422, { text: 'Posts cannot exceed 2000 characters' });

  const image = req.file ? await saveImage(req.file, 'posts') : '';
  let post;
  try {
    post = await Post.create({ author: req.user._id, text, image });
  } catch (err) {
    await removeImage(image);
    throw err;
  }
  await User.updateOne({ _id: req.user._id }, { $inc: { postsCount: 1 } });
  await post.populate('author', AUTHOR_FIELDS);

  // Let followers' open tabs know their timeline has something new.
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
  const oldImage = post.image;

  if (req.body.text !== undefined) post.text = cleanText(req.body.text, { multiline: true });
  let newImage = null;
  if (req.file) newImage = post.image = await saveImage(req.file, 'posts');
  else if (req.body.removeImage === 'true' || req.body.removeImage === true) post.image = '';

  if (!post.text && !post.image) {
    if (newImage) await removeImage(newImage);
    throw new AppError('A post needs some text or an image', 422, { text: 'A post needs some text or an image' });
  }
  if (post.isModified()) post.editedAt = new Date();

  try {
    await post.save();
  } catch (err) {
    if (newImage) await removeImage(newImage);
    throw err;
  }
  if (oldImage && oldImage !== post.image) await removeImage(oldImage);

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
    Comment.deleteMany({ post: post._id }),
    Notification.deleteMany({ post: post._id }),
    User.updateOne({ _id: post.author, postsCount: { $gt: 0 } }, { $inc: { postsCount: -1 } }),
  ]);
  await removeImage(post.image);
  realtime.broadcast('post:deleted', { id: post._id.toString() });
  res.json({ success: true, id: post._id.toString() });
});

exports.likePost = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'Post');
  const me = req.user._id;
  // Atomic & idempotent: only increments when the user is not already in `likes`.
  const result = await Post.updateOne({ _id: id, likes: { $ne: me } }, { $push: { likes: me }, $inc: { likesCount: 1 } });
  const post = await Post.findById(id).select('author likesCount commentsCount').lean();
  if (!post) throw new AppError('Post not found', 404);

  if (result.modifiedCount) {
    broadcastStats(post);
    await notify({ recipient: post.author, actor: me, type: 'like', post: post._id });
  }
  res.json({ success: true, liked: true, likesCount: post.likesCount });
});

exports.unlikePost = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'Post');
  const me = req.user._id;
  const result = await Post.updateOne({ _id: id, likes: me }, { $pull: { likes: me }, $inc: { likesCount: -1 } });
  const post = await Post.findById(id).select('author likesCount commentsCount').lean();
  if (!post) throw new AppError('Post not found', 404);

  if (result.modifiedCount) {
    broadcastStats(post);
    await retract({ recipient: post.author, actor: me, type: 'like', post: post._id });
  }
  res.json({ success: true, liked: false, likesCount: post.likesCount });
});

exports.likers = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'Post');
  const post = await Post.findById(id).select('+likes').populate({ path: 'likes', select: AUTHOR_FIELDS + ' followersCount' }).lean();
  if (!post) throw new AppError('Post not found', 404);
  const users = await serializeUsers(post.likes.filter(Boolean).reverse(), req.user?._id);
  res.json({ success: true, users });
});

exports.broadcastStats = broadcastStats;
