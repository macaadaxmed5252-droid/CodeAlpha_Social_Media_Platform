const router = require('express').Router();
const auth = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimits');

router.post('/register', authLimiter, auth.register);
router.post('/login', authLimiter, auth.login);
router.get('/me', protect, auth.me);
router.patch('/password', protect, authLimiter, auth.changePassword);

module.exports = router;
