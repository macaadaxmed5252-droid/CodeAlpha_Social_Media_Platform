const router = require('express').Router();
const posts = require('../controllers/postController');
const comments = require('../controllers/commentController');
const { protect, optionalAuth } = require('../middleware/auth');
const { postMedia } = require('../middleware/upload');
const { writeLimiter } = require('../middleware/rateLimits');

router.get('/feed', optionalAuth, posts.feed);
router.get('/search', optionalAuth, posts.search);
router.get('/trending', posts.trending);
router.get('/tag/:tag', optionalAuth, posts.byTag);
router.post('/', protect, writeLimiter, postMedia(), posts.createPost);

router.get('/:id', optionalAuth, posts.getPost);
router.patch('/:id', protect, writeLimiter, postMedia(), posts.updatePost);
router.delete('/:id', protect, posts.deletePost);

router.get('/:id/likes', optionalAuth, posts.likers);
router.post('/:id/like', protect, posts.likePost);
router.delete('/:id/like', protect, posts.unlikePost);

router.get('/:id/comments', optionalAuth, comments.listComments);
router.post('/:id/comments', protect, writeLimiter, comments.addComment);
router.delete('/:id/comments/:commentId', protect, comments.deleteComment);

module.exports = router;
