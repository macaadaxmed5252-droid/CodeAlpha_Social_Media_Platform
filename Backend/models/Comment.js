const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    text: {
      type: String,
      required: [true, 'Comment cannot be empty'],
      trim: true,
      maxlength: [500, 'Comments cannot exceed 500 characters'],
    },
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, createdAt: 1 });
commentSchema.index({ parent: 1 });

module.exports = mongoose.model('Comment', commentSchema);
