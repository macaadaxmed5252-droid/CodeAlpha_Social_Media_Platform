const mongoose = require('mongoose');

/**
 * One document per (post, user) like. A dedicated collection keeps Post
 * documents small no matter how popular they get, and the unique compound
 * index makes liking idempotent under concurrent double-clicks.
 */
const likeSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

likeSchema.index({ post: 1, user: 1 }, { unique: true });
likeSchema.index({ user: 1, post: 1 });
likeSchema.index({ post: 1, createdAt: -1 });

module.exports = mongoose.model('Like', likeSchema);
