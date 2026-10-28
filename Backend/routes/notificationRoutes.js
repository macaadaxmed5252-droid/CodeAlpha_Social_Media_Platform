const router = require('express').Router();
const notifications = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', notifications.list);
router.get('/unread-count', notifications.unreadCount);
router.patch('/read', notifications.markAllRead);

module.exports = router;
