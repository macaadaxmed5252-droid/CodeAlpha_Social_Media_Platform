const mongoose = require('mongoose');
const { extractHashtags } = require('../utils/hashtags');

const mediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'video'], required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true, default: '', maxlength: [2000, 'Posts cannot exceed 2000 characters'] },
    media: { type: mediaSchema, default: null },
    hashtags: { type: [String], default: [] },
    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

postSchema.index({ author: 1, _id: -1 });
postSchema.index({ hashtags: 1, _id: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ text: 'text' }, { weights: { text: 1 }, default_language: 'english' });

postSchema.pre('validate', function requireContent(next) {
  if (!this.text && !this.media?.url) this.invalidate('text', 'A post needs some text or media');
  next();
});

postSchema.pre('save', function syncHashtags(next) {
  if (this.isModified('text')) this.hashtags = extractHashtags(this.text);
  next();
});

module.exports = mongoose.model('Post', postSchema);
