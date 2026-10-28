const Follow = require('../models/Follow');
const Like = require('../models/Like');

function userSummary(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    avatar: user.avatar || '',
    bio: user.bio || '',
  };
}

function serializeUser(user, extra = {}) {
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    bio: user.bio || '',
    location: user.location || '',
    website: user.website || '',
    avatar: user.avatar || '',
    banner: user.banner || '',
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    postsCount: user.postsCount || 0,
    createdAt: user.createdAt,
    ...extra,
  };
}

function serializeMedia(media) {
  return media?.url ? { type: media.type, url: media.url } : null;
}

function serializePost(post, { liked = false, viewerId = null } = {}) {
  const authorId = post.author?._id?.toString() || post.author?.toString();
  return {
    id: post._id.toString(),
    author: post.author?._id ? userSummary(post.author) : { id: authorId },
    text: post.text || '',
    media: serializeMedia(post.media),
    hashtags: post.hashtags || [],
    likesCount: post.likesCount || 0,
    commentsCount: post.commentsCount || 0,
    likedByMe: Boolean(liked),
    isMine: Boolean(viewerId && authorId === viewerId.toString()),
    editedAt: post.editedAt || null,
    createdAt: post.createdAt,
  };
}

function serializeComment(comment, { viewerId = null, postAuthorId = null } = {}) {
  const authorId = comment.author?._id?.toString();
  const viewer = viewerId ? viewerId.toString() : null;
  return {
    id: comment._id.toString(),
    post: comment.post.toString(),
    parent: comment.parent ? comment.parent.toString() : null,
    author: userSummary(comment.author),
    text: comment.text,
    canDelete: Boolean(viewer && (viewer === authorId || viewer === postAuthorId?.toString())),
    createdAt: comment.createdAt,
  };
}

/** Returns a Set of post ids (strings) among `postIds` that `viewerId` has liked. */
async function likedSet(viewerId, postIds) {
  if (!viewerId || postIds.length === 0) return new Set();
  const rows = await Like.find({ user: viewerId, post: { $in: postIds } }).select('post').lean();
  return new Set(rows.map((r) => r.post.toString()));
}

/** Returns a Set of user ids (strings) among `userIds` that `viewerId` follows. */
async function followingSet(viewerId, userIds) {
  if (!viewerId || userIds.length === 0) return new Set();
  const rows = await Follow.find({ follower: viewerId, following: { $in: userIds } }).select('following').lean();
  return new Set(rows.map((r) => r.following.toString()));
}

async function serializePosts(posts, viewerId) {
  const liked = await likedSet(viewerId, posts.map((p) => p._id));
  return posts.map((p) => serializePost(p, { liked: liked.has(p._id.toString()), viewerId }));
}

async function serializeUsers(users, viewerId) {
  const following = await followingSet(viewerId, users.map((u) => u._id));
  const viewer = viewerId ? viewerId.toString() : null;
  return users.map((u) =>
    serializeUser(u, { isFollowing: following.has(u._id.toString()), isMe: viewer === u._id.toString() })
  );
}

module.exports = {
  userSummary,
  serializeUser,
  serializeMedia,
  serializePost,
  serializeComment,
  serializePosts,
  serializeUsers,
  likedSet,
  followingSet,
};
