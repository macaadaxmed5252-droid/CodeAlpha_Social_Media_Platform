<div align="center">

<img src="public/img/logo.svg" width="72" alt="Pulse logo" />

# Pulse: Mini Social Media Platform

**CodeAlpha Full Stack Development Internship, Task 2**

A full-stack social network with rich profiles, image and video posts, threaded comments, likes, follows, a real-time notifications hub, hashtag discovery and post search.

**Node.js · Express · MongoDB (Mongoose)** on the server · **Vanilla JavaScript SPA** with live DOM updates on the client

![Node](https://img.shields.io/badge/Node.js-%E2%89%A520.13-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%208-47A248?logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt(12)-7c5cff)
![Tests](https://img.shields.io/badge/tests-38%20passing-12b981)

</div>

---

## 📑 Contents
[Features](#-features) · [Security](#-security) · [Architecture](#%EF%B8%8F-architecture) · [Getting started](#-getting-started) · [API](#-rest-api) · [Design decisions](#-design-decisions)

---

## ✨ Features

### 1. Profiles and onboarding
- **Registration** shows a live **password strength meter and checklist**. Each rule ticks off as you type (8+ characters, a letter, a number, mixed case, a symbol). Every password field has a show/hide **eye toggle**.
- **Login** with your email or your @username.
- **Profile management** covers display name, username, **bio (with a live counter)**, **website**, **location**, **banner image upload** and **avatar upload**. All of them preview instantly and can be removed. Users without a photo get colourful initials avatars.
- Profile pages show the banner, posts, follower and following lists, join date and a *"Follows you"* badge.
- Settings includes password change (with the same checklist), a light/dark theme switch and logout.

### 2. Feed and posts
- Create **text, image or video posts** (JPG/PNG/GIF/WEBP up to 5 MB, MP4/WEBM/MOV up to 25 MB) with an **inline preview** before publishing. You can also paste images from the clipboard, add emoji from a picker and press **Ctrl + Enter** to post.
- **Edit** a post (change the text, replace the media or remove it) or **delete** it. Deletes go through a confirmation modal. Edited posts show an *"edited"* tag.
- **"For You"** (everyone, newest first) and **"Following"** (people you follow plus yourself) feed tabs, with a sliding tab indicator.
- **Infinite scroll** with cursor-based pagination, and skeleton placeholders while each page loads.
- `@mentions`, `#hashtags` and links are detected automatically. Hashtags are clickable.

### 3. Social interactions in real time
- **Instant like/unlike**: an optimistic toggle with a heart pop and particle burst, plus a counter that animates. Rapid clicks collapse into the minimum number of requests. **Double-click an image** to like it, Instagram-style.
- **Nested comments**: comment, **reply** (one level of threading) and delete your own comments. Post authors can moderate the comments on their posts.
- **Follow/unfollow**: follower and following counts update everywhere on screen at once. A *"Who to follow"* card suggests friends-of-friends first.
- **Live sync across tabs and users** over Server-Sent Events: like and comment counts, *"N new posts"* alerts, posts that are edited or deleted, and open comment threads.

### 4. Bonus features
- **🔔 Real-time notifications hub**: a dropdown under the bell with a live unread badge. It lists likes, comments, replies and new followers, auto-refreshes while open, marks items as read and offers *View all* for the full Activity page.
- **🔎 Post search and hashtag filtering**: search people, or search posts by **keyword** (MongoDB text index) or **#hashtag**. Clicking any hashtag opens a dedicated `#tag` page with a post count. A **Trending** card ranks the hashtags used over the last 14 days.
- **♾️ Infinite scroll** with cursor pagination on every feed, profile, tag and search list.

### 5. UI/UX design system
- **Glassmorphism** floating top bar (it hides when you scroll down and comes back when you scroll up). On mobile it becomes a **floating bottom dock** with a compose button.
- **Light and dark mode** that follows the OS setting by default, with no flash on page load.
- **Micro-interactions**: hover lift on posts, button press feedback, a character-count ring, animated counters, an image lightbox and modals with spring animations.
- **Skeleton loaders** for feeds, profiles, comments, notifications and user lists, plus **toast notifications** (e.g. *"Post created successfully ✨"*).
- **Modal dialogs** for editing profiles and posts, confirming deletes, and viewing followers or likers.
- **Accessibility**: semantic landmarks, a skip link, ARIA states, focus-trapped modals, Escape to close and support for `prefers-reduced-motion`.

---

## 🔐 Security

| Concern | Implementation |
| --- | --- |
| Passwords | **bcrypt, 12 salt rounds**. The hash uses `select: false` so it is never serialised. The minimum policy is enforced on both client and server. |
| Authentication | **JWT** (HS256, explicit algorithm allow-list). The `protect` and `optionalAuth` middleware attach the user. |
| Authorisation | Server-side ownership checks: only authors can edit or delete their posts, and a comment can be deleted by its author or by the post's author. |
| **XSS** | Two layers. (1) The server strips HTML tags, `<script>`/`<style>` blocks, comments, control characters and bidi-override characters from all text. (2) The client never uses `innerHTML` for user content: every string becomes a DOM text node through the `h()` helper. A strict **Content-Security-Policy** (`script-src 'self'`) is set through Helmet. |
| **CORS** | An allow-list policy (`CORS_ORIGINS`). The app's own origin is always allowed. Unknown origins get **403** on the API and no CORS headers. |
| **Rate limiting** | API: 600 per 15 min · Auth: 20 per 15 min · Writes: 30 per min. JSON bodies are capped at 100 KB. |
| NoSQL injection | `$`-prefixed and dotted keys are stripped from bodies and params. Inputs are cast to strings, and ObjectIds and hashtags are validated. |
| Uploads | Files are held in memory, and the **real file type is detected from magic bytes** (so a spoofed MIME type is rejected). Size limits are per type, names are random, files are served with `nosniff`, and replaced files are cleaned up. |
| Integrity | Likes and follows use **unique compound indexes**, so double-clicks can't inflate the counts. Counters change atomically with `$inc`. |

---

## 🏗️ Architecture

The code follows a modular layered MVC structure: **routes → middleware → controllers → models**, with shared helpers in `utils/`.

```
CodeAlpha_Social_Media_Platform/
├── config/             # env.js (validated env vars) · db.js (Mongoose connection)
├── controllers/        # authController · userController · postController · commentController · notificationController
├── models/             # User · Post · Comment · Like · Follow · Notification
├── routes/             # authRoutes · userRoutes · postRoutes · notificationRoutes · streamRoutes (SSE)
├── middleware/         # auth (JWT) · upload (multer) · cors · sanitize · rateLimits · errorHandler
├── utils/              # AppError · asyncHandler · sanitize · token · files · hashtags · serialize · notify · realtime
├── public/             # Frontend SPA served by Express
│   ├── index.html
│   ├── css/styles.css  # Design system: tokens, glass, components, animations, dark mode
│   ├── img/logo.svg
│   └── js/
│       ├── app.js            # Routes, app chrome (topbar / sidebars / dock), boot
│       ├── router.js         # Hash router with per-view teardown
│       ├── api.js · store.js · session.js · theme.js · realtime.js (EventSource)
│       ├── dom.js · ui.js    # Safe h() builder, icons, toasts, modals, skeletons, password checklist
│       ├── components/       # postCard · comments · composer · postList · notifications · follow · userRow
│       └── views/            # auth · feed · profile · misc (post, activity, search, tag, settings)
├── scripts/seed.js     # Demo data (users, banners, posts with images, likes, comments, hashtags)
├── tests/api.test.js   # 38 integration tests (node:test + supertest)
├── uploads/            # avatars/ · banners/ · posts/ (git-ignored user content)
├── app.js              # Express app: Helmet/CSP, CORS, parsers, static, routes, errors
├── server.js           # Entry point: DB connection + HTTP server + graceful shutdown
├── .env.example
└── README.md
```

### Data model and indexes

```
User ─┬─< Post ──┬─< Comment (parent → Comment, one level of replies)
      │          └─< Like >── User         unique (post, user)
      ├─< Follow >── User                  unique (follower, following)
      └─< Notification                     like · comment · reply · follow
```

| Collection | Key indexes | Why |
| --- | --- | --- |
| `posts` | `{author, _id}` · `{hashtags, _id}` · text index on `text` | Profile feeds, hashtag pages and keyword search, all paginated on `_id` |
| `likes` | unique `{post, user}` · `{user, post}` · `{post, createdAt}` | Idempotent likes, a bulk *"liked by me"* lookup per page, and the likers list |
| `follows` | unique `{follower, following}` · `{following, createdAt}` | Idempotent follows, feed fan-in and follower lists |
| `comments` | `{post, createdAt}` · `{parent}` | Thread loading and cascading deletes |
| `notifications` | `{recipient, createdAt}` | Notification hub and Activity page |

Likes live in their **own collection**, not in an array on the post, so post documents stay small no matter how popular they get. Like, comment, follower, following and post counts are **denormalised counters**, so each feed page needs only one query.

---

## 🚀 Getting started

### Prerequisites
- **Node.js 20.13+**
- **MongoDB 6+**, running locally or on Atlas

### Install and run

```bash
npm install
cp .env.example .env        # edit MONGO_URI / JWT_SECRET as needed
npm run seed                # optional demo data. ⚠ wipes the database in MONGO_URI
npm run dev                 # or: npm start
```

Open **http://localhost:5000**.

### Demo accounts (after `npm run seed`)

| Usernames | Password |
| --- | --- |
| `amina` · `omar` · `layla` · `yusuf` · `sara` · `hassan` | `Password123` |

> 💡 Open two browsers signed in as different users to watch likes, comments, follows, notifications and *"new posts"* alerts arrive live.

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `production` requires `JWT_SECRET`, hides 500 error details and enables `upgrade-insecure-requests` |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/codealpha_social` | MongoDB connection string |
| `JWT_SECRET` | – | Long random signing secret |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `CORS_ORIGINS` | *(empty)* | Comma-separated extra origins allowed to call the API |

### Tests

```bash
npm test
```

This runs **38 integration tests** covering:
- auth, validation and NoSQL-injection attempts
- uploads, including spoofed images and videos, and banners
- follows, both feed modes and cursor pagination
- likes (stored in their own collection), comments and replies
- permissions and cascading deletes
- hashtag extraction, filtering, trending and search
- XSS stripping, CORS and security headers

The tests use a throwaway database (`codealpha_social_test_tmp`) that is dropped afterwards. Override it with `TEST_MONGO_URI`.

---

## 📡 REST API

All responses are JSON in the form `{ success, ... }`. Errors look like `{ success: false, message, details? }`. 🔒 means the route needs `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account → `{ token, user }` |
| POST | `/api/auth/login` | `{ identifier, password }` (email or username) |
| GET 🔒 | `/api/auth/me` | Current user + unread notification count |
| PATCH 🔒 | `/api/auth/password` | Change password |
| GET | `/api/users/search?q=` | Search people |
| GET 🔒 | `/api/users/suggestions` | Who to follow |
| PATCH 🔒 | `/api/users/me` | Multipart: `avatar`, `banner`, `name`, `username`, `bio`, `location`, `website`, `removeAvatar`, `removeBanner` |
| GET | `/api/users/:username` | Profile (+ `isFollowing`, `followsYou`) |
| GET | `/api/users/:username/posts?cursor=` | A user's posts |
| GET | `/api/users/:username/followers` · `/following` | Connection lists (`?page=`) |
| POST 🔒 / DELETE 🔒 | `/api/users/:username/follow` | Follow / unfollow |
| GET | `/api/posts/feed?mode=foryou\|following&cursor=` | Feeds (🔒 for `following`) |
| GET | `/api/posts/search?q=&cursor=` | Keyword search (or `#tag`) |
| GET | `/api/posts/tag/:tag?cursor=` | Posts with a hashtag (+ `total`) |
| GET | `/api/posts/trending` | Top hashtags (last 14 days) |
| POST 🔒 | `/api/posts` | Multipart: `text`, `media` (image or video) |
| GET | `/api/posts/:id` | Single post |
| PATCH 🔒 / DELETE 🔒 | `/api/posts/:id` | Edit (`text`, `media`, `removeMedia`) / delete (author only) |
| POST 🔒 / DELETE 🔒 | `/api/posts/:id/like` | Like / unlike (idempotent) |
| GET | `/api/posts/:id/likes` | Users who liked |
| GET · POST 🔒 | `/api/posts/:id/comments` | List / add `{ text, parentId? }` |
| DELETE 🔒 | `/api/posts/:id/comments/:commentId` | Delete a comment (and its replies) |
| GET 🔒 | `/api/notifications?cursor=&limit=` | Notifications |
| GET 🔒 | `/api/notifications/unread-count` | Unread count |
| PATCH 🔒 | `/api/notifications/read` | Mark all read |
| GET | `/api/stream?token=` | SSE events: `post:stats` `post:new` `feed:new` `post:updated` `post:deleted` `comment:new` `comment:deleted` `notification` |
| GET | `/api/health` | Health check |

---

## 🧭 Design decisions

- **Vanilla JS and a hand-written CSS design system** instead of a framework and Tailwind. The app has no build step: ES modules load directly in the browser and Express serves them as they are. The design tokens (CSS custom properties for colour, radius, shadow and motion) cover the same ground as a utility framework, and swapping themes is a single attribute change. The small `h()` DOM helper gives JSX-like ergonomics and is **XSS-safe by construction**.
- **Server-Sent Events instead of WebSockets.** Every live update flows from server to client, so SSE is enough. It runs over plain HTTP, reconnects automatically and needs no extra dependency.
- **Cursor pagination on `_id`** keeps infinite scroll fast and stable while new posts arrive. Offset pagination would skip or repeat posts in that situation.
- **Optimistic UI.** Likes and follows update instantly and roll back with a toast if the server rejects the change.

---

## 📄 License

MIT © 2026 Muad Ahmed Hassan. Built for the **CodeAlpha** Full Stack Development Internship.
