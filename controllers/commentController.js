const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../utils/realtime');
const { cleanText, isObjectId, assertObjectId } = require('../utils/sanitize');
const { serializeComment } = require('../utils/serialize');
const { notify } = require('../utils/notify');
const { broadcastStats } = require('./postController');

const AUTHOR_FIELDS = 'username name avatar';
const MAX_COMMENTS = 200;

async function loadPost(id) {
  assertObjectId(id, 'Post');
  const post = await Post.findById(id).select('author likesCount commentsCount');
  if (!post) throw new AppError('Post not found', 404);
  return post;
}

exports.listComments = asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id);
  const comments = await Comment.find({ post: post._id })
    .sort({ createdAt: 1 })
    .limit(MAX_COMMENTS)
    .populate('author', AUTHOR_FIELDS)
    .lean();
  const opts = { viewerId: req.user?._id, postAuthorId: post.author };
  res.json({
    success: true,
    comments: comments.filter((c) => c.author).map((c) => serializeComment(c, opts)),
  });
});

exports.addComment = asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id);
  const text = cleanText(req.body.text, { multiline: true });
  if (!text) throw new AppError('Comment cannot be empty', 422, { text: 'Comment cannot be empty' });
  if (text.length > 500) throw new AppError('Comments cannot exceed 500 characters', 422, { text: 'Comments cannot exceed 500 characters' });

  let parent = null;
  if (req.body.parentId) {
    if (!isObjectId(req.body.parentId)) throw new AppError('Comment not found', 404);
    parent = await Comment.findOne({ _id: req.body.parentId, post: post._id }).select('author parent');
    if (!parent) throw new AppError('Comment not found', 404);
    // Threads are one level deep: replying to a reply attaches to its root comment.
    if (parent.parent) parent = await Comment.findById(parent.parent).select('author parent');
  }

  const comment = await Comment.create({ post: post._id, author: req.user._id, text, parent: parent?._id || null });
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { commentsCount: 1 } }, { new: true }).select('likesCount commentsCount');
  await comment.populate('author', AUTHOR_FIELDS);

  const serialized = serializeComment(comment, { viewerId: req.user._id, postAuthorId: post.author });
  broadcastStats(updated);
  realtime.broadcast('comment:new', { postId: post._id.toString(), commentId: serialized.id, authorId: serialized.author.id });

  await notify({ recipient: post.author, actor: req.user._id, type: 'comment', post: post._id, comment: comment._id });
  if (parent && !parent.author.equals(post.author)) {
    await notify({ recipient: parent.author, actor: req.user._id, type: 'reply', post: post._id, comment: comment._id });
  }

  res.status(201).json({ success: true, comment: serialized, commentsCount: updated.commentsCount });
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id);
  const commentId = assertObjectId(req.params.commentId, 'Comment');
  const comment = await Comment.findOne({ _id: commentId, post: post._id });
  if (!comment) throw new AppError('Comment not found', 404);

  const me = req.user._id;
  if (!comment.author.equals(me) && !post.author.equals(me)) {
    throw new AppError('You can only delete your own comments', 403);
  }

  // Removing a top-level comment removes its replies too.
  const ids = [comment._id, ...(await Comment.find({ parent: comment._id }).distinct('_id'))];
  await Promise.all([Comment.deleteMany({ _id: { $in: ids } }), Notification.deleteMany({ comment: { $in: ids } })]);
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { commentsCount: -ids.length } }, { new: true }).select(
    'likesCount commentsCount'
  );
  if (updated.commentsCount < 0) {
    updated.commentsCount = await Comment.countDocuments({ post: post._id });
    await Post.updateOne({ _id: post._id }, { commentsCount: updated.commentsCount });
  }

  broadcastStats(updated);
  realtime.broadcast('comment:deleted', { postId: post._id.toString(), ids: ids.map(String) });
  res.json({ success: true, removed: ids.map(String), commentsCount: updated.commentsCount });
});
