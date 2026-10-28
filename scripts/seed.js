/**
 * Demo data: `npm run seed`
 * Wipes the configured database and creates users, follows, posts (some with
 * generated gradient images), likes, comments and activity.
 * All demo accounts use the password: Password123
 */
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const env = require('../config/env');
const { connectDB } = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const { UPLOAD_ROOT } = require('../utils/files');

const PASSWORD = 'Password123';

const USERS = [
  { username: 'amina', name: 'Amina Yusuf', bio: 'Product designer ✏️ | coffee + pixels | always sketching', location: 'Nairobi', website: 'amina.design', banner: ['#7c5cff', '#ff5c8a', '#ffd166'] },
  { username: 'omar', name: 'Omar Hassan', bio: 'Full-stack dev. Building things with Node & Mongo. 🚀', location: 'Mogadishu', website: '', banner: ['#0f172a', '#3b82f6', '#06b6d4'] },
  { username: 'layla', name: 'Layla Ahmed', bio: 'Photographer 📸 chasing golden hour', location: 'Dubai', website: '', banner: ['#f6d365', '#fda085', '#4facfe'] },
  { username: 'yusuf', name: 'Yusuf Ali', bio: 'Runner, reader, occasional poet.', location: 'London', website: '' },
  { username: 'sara', name: 'Sara Mohamed', bio: 'CS student @ uni · open source enthusiast · #100DaysOfCode', location: 'Hargeisa', website: '' },
  { username: 'hassan', name: 'Hassan Abdi', bio: 'Chef 🍲 sharing recipes from home', location: 'Djibouti', website: '' },
];

const FOLLOWS = {
  amina: ['omar', 'layla', 'sara', 'hassan'],
  omar: ['amina', 'sara', 'yusuf'],
  layla: ['amina', 'hassan'],
  yusuf: ['omar', 'layla'],
  sara: ['omar', 'amina', 'layla', 'yusuf'],
  hassan: ['layla'],
};

const POSTS = [
  { by: 'layla', text: 'Golden hour never misses. 🌅 Shot this on my walk home tonight. #photography #goldenhour', image: ['#ff9a8b', '#ff6a88', '#ff99ac'], hoursAgo: 1 },
  { by: 'omar', text: 'Just shipped real-time likes with Server-Sent Events - no polling, no websockets library, ~40 lines of code. Sometimes the simple tool is the right one. #nodejs', hoursAgo: 2 },
  { by: 'sara', text: 'Day 42 of #100DaysOfCode ✅\n\nToday: cursor-based pagination in MongoDB. Way better than skip/limit for infinite feeds. #mongodb', hoursAgo: 4 },
  { by: 'hassan', text: 'Sunday special: slow-cooked lamb with spiced rice 🍲 Recipe in the comments! #homecooking #recipes', image: ['#f6d365', '#fda085', '#f5576c'], hoursAgo: 6 },
  { by: 'amina', text: 'New colour palette exploration for a side project. Which one would you pick? 🎨 #design #ui', image: ['#7c5cff', '#ff5c8a', '#ffd166'], hoursAgo: 9 },
  { by: 'yusuf', text: 'Morning 10k done before sunrise. The city is so quiet at 5am. 🏃‍♂️ #running', hoursAgo: 13 },
  { by: 'layla', text: 'Blue hour in the desert. #photography', image: ['#4facfe', '#00f2fe', '#43e97b'], hoursAgo: 20 },
  { by: 'omar', text: 'Hot take: write the README before the code. It forces you to design the API from the user’s point of view. @sara agree? #webdev', hoursAgo: 26 },
  { by: 'sara', text: 'Finally understood JWT refresh flows. Writing a blog post about it this weekend 📝 #javascript #100DaysOfCode', hoursAgo: 30 },
  { by: 'amina', text: 'Reminder: whitespace is a feature, not wasted space. ✨ #design', hoursAgo: 40 },
  { by: 'hassan', text: 'Fresh bread straight from the oven. Nothing beats that smell. #homecooking', image: ['#e0c3fc', '#8ec5fc', '#f093fb'], hoursAgo: 52 },
  { by: 'yusuf', text: '“The best time to plant a tree was 20 years ago. The second best time is now.”', hoursAgo: 70 },
];

const COMMENTS = [
  { post: 0, by: 'amina', text: 'This is stunning 😍' },
  { post: 0, by: 'hassan', text: 'Where was this taken?' },
  { post: 0, by: 'layla', text: 'Near the old harbour 🙂', replyTo: 1 },
  { post: 1, by: 'sara', text: 'Would love a write-up on this!' },
  { post: 1, by: 'omar', text: 'Coming soon 👀', replyTo: 3 },
  { post: 3, by: 'layla', text: 'Saving this for the weekend!' },
  { post: 4, by: 'omar', text: 'Second one, easily.' },
  { post: 4, by: 'sara', text: 'The purple → pink gradient 💜' },
  { post: 7, by: 'sara', text: 'Absolutely agree - README-driven development!' },
];

const LIKES = {
  0: ['amina', 'omar', 'hassan', 'sara', 'yusuf'],
  1: ['sara', 'amina', 'yusuf'],
  2: ['omar', 'amina'],
  3: ['layla', 'amina', 'sara'],
  4: ['omar', 'layla', 'sara', 'hassan'],
  5: ['layla'],
  6: ['amina', 'hassan', 'yusuf'],
  7: ['sara', 'yusuf'],
  10: ['layla', 'amina'],
};

/* Tiny PNG encoder for diagonal gradient images (no image libraries needed). */
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

function gradientPng(colors, width = 800, height = 520) {
  const stops = colors.map(hex);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const t = (x / width) * 0.6 + (y / height) * 0.4;
      const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
      const lt = t * (stops.length - 1) - seg;
      // soft "sun" highlight for some depth
      const dx = x - width * 0.7;
      const dy = y - height * 0.35;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / (height * 0.55)) * 70;
      for (let c = 0; c < 3; c += 1) {
        const v = stops[seg][c] + (stops[seg + 1][c] - stops[seg][c]) * lt + glow;
        raw[row + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function writeBanner(username, colors) {
  const name = `seed-${username}.png`;
  await fs.writeFile(path.join(UPLOAD_ROOT, 'banners', name), gradientPng(colors, 1200, 360));
  return `/uploads/banners/${name}`;
}

async function clearUploads() {
  for (const folder of ['avatars', 'banners', 'posts']) {
    const dir = path.join(UPLOAD_ROOT, folder);
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) if (f !== '.gitkeep') await fs.unlink(path.join(dir, f));
  }
}

async function seed() {
  await connectDB(env.mongoUri);
  console.log(`[seed] connected to ${mongoose.connection.name}`);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Follow, Post, Like, Comment, Notification].map((m) => m.syncIndexes()));
  await clearUploads();

  const users = {};
  for (const u of USERS) {
    users[u.username] = await User.create({
      ...u,
      email: `${u.username}@pulse.dev`,
      password: PASSWORD,
      website: u.website ? `https://${u.website}/` : '',
      banner: u.banner ? await writeBanner(u.username, u.banner) : '',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * (30 + Math.random() * 120)),
    });
  }

  for (const [from, list] of Object.entries(FOLLOWS)) {
    for (const to of list) {
      await Follow.create({ follower: users[from]._id, following: users[to]._id });
      await Notification.create({ recipient: users[to]._id, actor: users[from]._id, type: 'follow', read: true });
    }
  }

  const posts = [];
  for (const [i, p] of POSTS.entries()) {
    let media = null;
    if (p.image) {
      const name = `seed-${i}.png`;
      await fs.writeFile(path.join(UPLOAD_ROOT, 'posts', name), gradientPng(p.image));
      media = { type: 'image', url: `/uploads/posts/${name}` };
    }
    const createdAt = new Date(Date.now() - p.hoursAgo * 3600 * 1000);
    // Insert directly so ObjectIds follow createdAt order (feeds paginate on _id).
    const _id = mongoose.Types.ObjectId.createFromTime(Math.floor(createdAt.getTime() / 1000));
    posts[i] = await Post.create({ _id, author: users[p.by]._id, text: p.text, media, createdAt, updatedAt: createdAt });
  }

  for (const [i, likers] of Object.entries(LIKES)) {
    const post = posts[i];
    await Like.insertMany(likers.map((u) => ({ post: post._id, user: users[u]._id })));
    await Post.updateOne({ _id: post._id }, { likesCount: likers.length });
    for (const u of likers) {
      if (!users[u]._id.equals(post.author)) {
        await Notification.create({ recipient: post.author, actor: users[u]._id, type: 'like', post: post._id, read: Math.random() > 0.5 });
      }
    }
  }

  const created = [];
  for (const c of COMMENTS) {
    const post = posts[c.post];
    const parent = c.replyTo !== undefined ? created[c.replyTo] : null;
    const comment = await Comment.create({ post: post._id, author: users[c.by]._id, text: c.text, parent: parent?._id || null });
    created.push(comment);
    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });
    if (!users[c.by]._id.equals(post.author)) {
      await Notification.create({ recipient: post.author, actor: users[c.by]._id, type: 'comment', post: post._id, comment: comment._id });
    }
  }

  for (const u of Object.values(users)) {
    await User.updateOne(
      { _id: u._id },
      {
        followersCount: await Follow.countDocuments({ following: u._id }),
        followingCount: await Follow.countDocuments({ follower: u._id }),
        postsCount: await Post.countDocuments({ author: u._id }),
      }
    );
  }

  console.log(`[seed] ${USERS.length} users, ${POSTS.length} posts, ${COMMENTS.length} comments`);
  console.log(`[seed] log in with any of: ${USERS.map((u) => u.username).join(', ')}  /  password: ${PASSWORD}`);
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
