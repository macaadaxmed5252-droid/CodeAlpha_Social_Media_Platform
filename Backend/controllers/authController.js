const User = require('../models/User');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { cleanText } = require('../utils/sanitize');
const { signToken } = require('../utils/token');
const { serializeUser } = require('../utils/serialize');

const RESERVED = new Set(['admin', 'root', 'api', 'login', 'register', 'settings', 'explore', 'activity', 'me', 'pulse']);

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  if (Buffer.byteLength(password) > 72) return 'Password is too long';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number';
  return null;
}

const sessionPayload = async (user) => ({
  token: signToken(user._id),
  user: serializeUser(user, { isMe: true }),
  unread: await Notification.countDocuments({ recipient: user._id, read: false }),
});

exports.register = asyncHandler(async (req, res) => {
  const name = cleanText(req.body.name);
  const username = cleanText(req.body.username).toLowerCase().replace(/^@/, '');
  const email = cleanText(req.body.email).toLowerCase();
  const { password } = req.body;

  const errors = {};
  if (!name) errors.name = 'Display name is required';
  else if (name.length > 50) errors.name = 'Display name cannot exceed 50 characters';
  if (!User.USERNAME_RE.test(username)) errors.username = 'Username must be 3-20 characters: letters, numbers or underscores';
  else if (RESERVED.has(username)) errors.username = 'That username is reserved';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Please provide a valid email address';
  const pwError = validatePassword(password);
  if (pwError) errors.password = pwError;
  if (Object.keys(errors).length) throw new AppError(Object.values(errors)[0], 422, errors);

  const clash = await User.findOne({ $or: [{ email }, { username }] }).select('email username').lean();
  if (clash) {
    const field = clash.email === email ? 'email' : 'username';
    const message = field === 'email' ? 'That email is already registered' : 'That username is taken';
    throw new AppError(message, 409, { [field]: message });
  }

  const user = await User.create({ name, username, email, password });
  res.status(201).json({ success: true, ...(await sessionPayload(user)) });
});

exports.login = asyncHandler(async (req, res) => {
  const identifier = cleanText(req.body.identifier ?? req.body.email).toLowerCase().replace(/^@/, '');
  const { password } = req.body;
  if (!identifier || typeof password !== 'string' || !password) {
    throw new AppError('Please enter your email/username and password', 422);
  }

  const user = await User.findOne(identifier.includes('@') ? { email: identifier } : { username: identifier }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new AppError('Invalid credentials', 401);

  res.json({ success: true, ...(await sessionPayload(user)) });
});

exports.me = asyncHandler(async (req, res) => {
  const unread = await Notification.countDocuments({ recipient: req.user._id, read: false });
  res.json({ success: true, user: serializeUser(req.user, { isMe: true }), unread });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (typeof currentPassword !== 'string' || !(await user.comparePassword(currentPassword))) {
    throw new AppError('Current password is incorrect', 401, { currentPassword: 'Current password is incorrect' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) throw new AppError(pwError, 422, { newPassword: pwError });

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated', token: signToken(user._id) });
});
