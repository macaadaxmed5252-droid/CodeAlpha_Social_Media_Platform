const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../utils/realtime');
const { isObjectId } = require('../utils/sanitize');
const { userSummary, serializeMedia } = require('../utils/serialize');

const PAGE_SIZE = 20;

exports.list = asyncHandler(async (req, res) => {
  const limit = Math.min(PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE));
  const query = { recipient: req.user._id };
  if (isObjectId(req.query.cursor)) query._id = { $lt: req.query.cursor };

  const rows = await Notification.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('actor', 'username name avatar')
    .populate('post', 'text media')
    .populate('comment', 'text')
    .lean();

  const page = rows.slice(0, limit).filter((n) => n.actor && (n.type === 'follow' || n.post));
  res.json({
    success: true,
    notifications: page.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      read: n.read,
      actor: userSummary(n.actor),
      post: n.post ? { id: n.post._id.toString(), text: (n.post.text || '').slice(0, 120), media: serializeMedia(n.post.media) } : null,
      comment: n.comment ? { id: n.comment._id.toString(), text: n.comment.text.slice(0, 160) } : null,
      createdAt: n.createdAt,
    })),
    nextCursor: rows.length > limit ? rows[limit - 1]._id.toString() : null,
  });
});

exports.unreadCount = asyncHandler(async (req, res) => {
  const unread = await Notification.countDocuments({ recipient: req.user._id, read: false });
  res.json({ success: true, unread });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, read: false }, { $set: { read: true } });
  realtime.notifyUser(req.user._id, 'notification', { unread: 0 });
  res.json({ success: true, unread: 0 });
});
