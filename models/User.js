const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [USERNAME_RE, 'Username must be 3-20 characters: letters, numbers or underscores'],
    },
    name: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [1, 'Display name is required'],
      maxlength: [50, 'Display name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [EMAIL_RE, 'Please provide a valid email address'],
    },
    password: { type: String, required: true, select: false },
    bio: { type: String, trim: true, default: '', maxlength: [160, 'Bio cannot exceed 160 characters'] },
    location: { type: String, trim: true, default: '', maxlength: [40, 'Location cannot exceed 40 characters'] },
    website: { type: String, trim: true, default: '', maxlength: [100, 'Website cannot exceed 100 characters'] },
    avatar: { type: String, default: '' },
    banner: { type: String, default: '' },
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    postsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.statics.USERNAME_RE = USERNAME_RE;

module.exports = mongoose.model('User', userSchema);
