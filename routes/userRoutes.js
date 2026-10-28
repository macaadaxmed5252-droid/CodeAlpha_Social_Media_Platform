const router = require('express').Router();
const users = require('../controllers/userController');
const posts = require('../controllers/postController');
const { protect, optionalAuth } = require('../middleware/auth');
const { profileImages } = require('../middleware/upload');
const { writeLimiter } = require('../middleware/rateLimits');

router.get('/search', optionalAuth, users.search);
router.get('/suggestions', protect, users.suggestions);
router.patch('/me', protect, writeLimiter, profileImages(), users.updateMe);

router.get('/:username', optionalAuth, users.getProfile);
router.get('/:username/posts', optionalAuth, posts.userPosts);
router.get('/:username/followers', optionalAuth, users.followers);
router.get('/:username/following', optionalAuth, users.following);
router.post('/:username/follow', protect, users.follow);
router.delete('/:username/follow', protect, users.unfollow);

module.exports = router;
