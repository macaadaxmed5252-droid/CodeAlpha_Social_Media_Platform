const Notification = require('../models/Notification');
const realtime = require('./realtime');

async function pushUnread(recipient) {
  const unread = await Notification.countDocuments({ recipient, read: false });
  realtime.notifyUser(recipient, 'notification', { unread });
}

/**
 * Records an activity item for `recipient`. Likes and follows are de-duplicated so
 * rapid toggling never spams the activity feed. Self-actions are ignored.
 */
async function notify({ recipient, actor, type, post = null, comment = null }) {
  if (!recipient || recipient.toString() === actor.toString()) return;
  if (type === 'like' || type === 'follow') {
    await Notification.findOneAndUpdate(
      { recipient, actor, type, post },
      { $set: { read: false, createdAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true, timestamps: false }
    );
  } else {
    await Notification.create({ recipient, actor, type, post, comment });
  }
  await pushUnread(recipient);
}

/** Removes the activity item created by a like / follow when it is undone. */
async function retract({ recipient, actor, type, post = null }) {
  if (!recipient || recipient.toString() === actor.toString()) return;
  const { deletedCount } = await Notification.deleteMany({ recipient, actor, type, post });
  if (deletedCount) await pushUnread(recipient);
}

// Notifications are a side effect: never fail the user's request because of them.
const safe = (fn) => (args) => fn(args).catch((err) => console.error('[notify]', err.message));

module.exports = { notify: safe(notify), retract: safe(retract), pushUnread };
