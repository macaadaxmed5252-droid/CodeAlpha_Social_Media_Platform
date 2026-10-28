const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, trim: true, default: '', maxlength: [2000, 'Posts cannot exceed 2000 characters'] },
    image: { type: String, default: '' },
    likes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1, _id: -1 });
postSchema.index({ author: 1, createdAt: -1 });

postSchema.pre('validate', function requireContent(next) {
  if (!this.text && !this.image) this.invalidate('text', 'A post needs some text or an image');
  next();
});

module.exports = mongoose.model('Post', postSchema);
