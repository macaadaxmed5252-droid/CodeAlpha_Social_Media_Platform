const User = require('../models/User');
const Follow = require('../models/Follow');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { cleanText, cleanUrl } = require('../utils/sanitize');
const { saveImage, removeFile } = require('../utils/files');
const { serializeUser, serializeUsers, followingSet } = require('../utils/serialize');
const { notify, retract } = require('../utils/notify');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findByUsername(username) {
  const handle = cleanText(username).toLowerCase();
  if (!User.USERNAME_RE.test(handle)) throw new AppError('User not found', 404);
  const user = await User.findOne({ username: handle });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

exports.getProfile = asyncHandler(async (req, res) => {
  const user = await findByUsername(req.params.username);
  const viewerId = req.user?._id;
  const isMe = Boolean(viewerId && viewerId.equals(user._id));
  const [following, followsYou] = await Promise.all([
    followingSet(viewerId, [user._id]),
    viewerId && !isMe ? Follow.exists({ follower: user._id, following: viewerId }) : null,
  ]);
  res.json({
    success: true,
    user: serializeUser(user, { isMe, isFollowing: following.has(user._id.toString()), followsYou: Boolean(followsYou) }),
  });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const user = req.user;
  const updates = {};
  if (req.body.name !== undefined) updates.name = cleanText(req.body.name);
  if (req.body.bio !== undefined) updates.bio = cleanText(req.body.bio, { multiline: true });
  if (req.body.location !== undefined) updates.location = cleanText(req.body.location);
  if (req.body.website !== undefined) updates.website = cleanUrl(req.body.website);
  if (req.body.username !== undefined) {
    const username = cleanText(req.body.username).toLowerCase().replace(/^@/, '');
    if (!User.USERNAME_RE.test(username)) {
      throw new AppError('Username must be 3-20 characters: letters, numbers or underscores', 422, {
        username: 'Username must be 3-20 characters: letters, numbers or underscores',
      });
    }
    updates.username = username;
  }

  // Avatar and banner share the same flow: upload replaces, `remove<Field>` clears.
  const previous = { avatar: user.avatar, banner: user.banner };
  const saved = [];
  try {
    for (const [fieldName, folder, flag] of [
      ['avatar', 'avatars', 'removeAvatar'],
      ['banner', 'banners', 'removeBanner'],
    ]) {
      const file = req.files?.[fieldName]?.[0];
      if (file) {
        updates[fieldName] = await saveImage(file, folder);
        saved.push(updates[fieldName]);
      } else if (req.body[flag] === 'true' || req.body[flag] === true) {
        updates[fieldName] = '';
      }
    }
    user.set(updates);
    await user.save();
  } catch (err) {
    await Promise.all(saved.map(removeFile));
    throw err;
  }
  for (const fieldName of ['avatar', 'banner']) {
    if (updates[fieldName] !== undefined && previous[fieldName] && previous[fieldName] !== user[fieldName]) {
      await removeFile(previous[fieldName]);
    }
  }

  res.json({ success: true, user: serializeUser(user, { isMe: true }) });
});

exports.search = asyncHandler(async (req, res) => {
  const q = cleanText(req.query.q).replace(/^@/, '').slice(0, 40);
  if (!q) return res.json({ success: true, users: [] });
  const pattern = new RegExp(escapeRegex(q), 'i');
  const users = await User.find({ $or: [{ username: pattern }, { name: pattern }] })
    .sort({ followersCount: -1 })
    .limit(20);
  res.json({ success: true, users: await serializeUsers(users, req.user?._id) });
});

exports.suggestions = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const followed = await Follow.find({ follower: me }).distinct('following');
  const exclude = [me, ...followed];

  // Prefer friends-of-friends, then fill up with popular accounts.
  const fof = await Follow.aggregate([
    { $match: { follower: { $in: followed }, following: { $nin: exclude } } },
    { $group: { _id: '$following', mutuals: { $sum: 1 } } },
    { $sort: { mutuals: -1 } },
    { $limit: 5 },
  ]);
  const ids = fof.map((r) => r._id);
  let users = ids.length ? await User.find({ _id: { $in: ids } }) : [];
  users.sort((a, b) => ids.findIndex((id) => id.equals(a._id)) - ids.findIndex((id) => id.equals(b._id)));
  if (users.length < 5) {
    const more = await User.find({ _id: { $nin: [...exclude, ...ids] } })
      .sort({ followersCount: -1, createdAt: -1 })
      .limit(5 - users.length);
    users = users.concat(more);
  }
  res.json({ success: true, users: await serializeUsers(users, me) });
});

async function listConnections(req, res, direction) {
  const user = await findByUsername(req.params.username);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const match = direction === 'followers' ? { following: user._id } : { follower: user._id };
  const field = direction === 'followers' ? 'follower' : 'following';
  const rows = await Follow.find(match)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit + 1)
    .populate(field)
    .lean();
  const users = rows.slice(0, limit).map((r) => r[field]).filter(Boolean);
  res.json({ success: true, users: await serializeUsers(users, req.user?._id), hasMore: rows.length > limit });
}

exports.followers = asyncHandler((req, res) => listConnections(req, res, 'followers'));
exports.following = asyncHandler((req, res) => listConnections(req, res, 'following'));

exports.follow = asyncHandler(async (req, res) => {
  const target = await findByUsername(req.params.username);
  const me = req.user._id;
  if (target._id.equals(me)) throw new AppError("You can't follow yourself", 400);

  // The unique (follower, following) index makes this idempotent under double-clicks.
  let created = false;
  try {
    await Follow.create({ follower: me, following: target._id });
    created = true;
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  if (created) {
    await Promise.all([
      User.updateOne({ _id: target._id }, { $inc: { followersCount: 1 } }),
      User.updateOne({ _id: me }, { $inc: { followingCount: 1 } }),
    ]);
    await notify({ recipient: target._id, actor: me, type: 'follow' });
  }
  const fresh = await User.findById(target._id).select('followersCount').lean();
  res.status(created ? 201 : 200).json({ success: true, isFollowing: true, followersCount: fresh.followersCount });
});

exports.unfollow = asyncHandler(async (req, res) => {
  const target = await findByUsername(req.params.username);
  const me = req.user._id;
  const removed = await Follow.findOneAndDelete({ follower: me, following: target._id });
  if (removed) {
    await Promise.all([
      User.updateOne({ _id: target._id, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } }),
      User.updateOne({ _id: me, followingCount: { $gt: 0 } }, { $inc: { followingCount: -1 } }),
    ]);
    await retract({ recipient: target._id, actor: me, type: 'follow' });
  }
  const fresh = await User.findById(target._id).select('followersCount').lean();
  res.json({ success: true, isFollowing: false, followersCount: fresh.followersCount });
});

exports.findByUsername = findByUsername;
