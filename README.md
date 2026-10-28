<div align="center">

<img src="Frontend/img/logo.svg" width="72" alt="Pulse logo" />

# Pulse: a mini social media platform

**CodeAlpha Full Stack Development Internship, Task 2**

A full-stack social network with profiles, posts, nested comments, likes, follows, a personal activity feed and live updates.
Built with **Node.js · Express · MongoDB (Mongoose)** on the server and a framework-free **vanilla JavaScript SPA** on the client.

![Node](https://img.shields.io/badge/Node.js-%E2%89%A520.13-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%208-47A248?logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-7c5cff)
![Tests](https://img.shields.io/badge/tests-28%20passing-12b981)

</div>

---

## ✨ Features

### 1. User profiles and avatars
- Register and log in. Passwords are hashed with **bcrypt (12 rounds)**, and sessions use **JWT** bearer tokens.
- Log in with either your **email or your @username**. A live **password-strength meter** shows on sign-up.
- Editable profile fields: display name, username, **bio (160 chars, with a live counter)**, location and website.
- **Profile picture upload** with an instant preview and a remove option. If there's no photo, you get a colourful initials avatar.
- Profile pages show posts, followers, following, join date and a "Follows you" badge.
- Change your password from Settings.

### 2. Posts and comments
- Create **text and/or image posts** (JPG, PNG, GIF or WEBP, up to 5 MB). You can paste an image straight from the clipboard, and **Ctrl + Enter** publishes.
- **Edit** a post (change the text, or replace or remove the image) and **delete** it. Edited posts get an "edited" tag. Deleting a post also removes its comments, activity items and image file.
- Long posts collapse behind **"Show more"**. `@mentions`, `#hashtags` and links are highlighted automatically.
- **Comment sections open inline** under each post, with **one level of threaded replies** ("Reply" on a reply attaches to the root comment).
- You can delete your own comments. Post authors can moderate any comment on their posts.

### 3. Likes and follows
- **Optimistic like/unlike**: the heart reacts instantly with a pop and particle burst, then syncs with the server. Rapid clicks collapse into the minimum number of requests.
- **Double-click an image to like it**, with an animated heart overlay.
- **See who liked** a post.
- **Follow and unfollow** update follower and following counts everywhere on screen at once.
- **"Who to follow"** suggestions rank friends-of-friends first, then popular accounts.
- **Personalised home feed** (people you follow plus yourself) and a global **Explore** feed, both with infinite scroll.
- An **Activity** page lists likes, comments, replies and new followers, with an unread badge.

### 4. Real-time updates
- **Server-Sent Events** (`/api/stream`) push like and comment counts to every open tab as they change.
- A **"N new posts" pill** appears when people you follow publish something.
- Comment threads that are open refresh live, and deleted posts animate out of everyone's feed.
- Notification badges update as new activity arrives.

### 5. UI and UX
- **Floating glass navigation** that hides as you scroll down and comes back when you scroll up. On mobile it becomes a **floating bottom dock** with a compose button.
- **Skeleton loaders** for feeds, profiles, comments and user lists.
- **Toast notifications** with an animated progress bar.
- Micro-interactions throughout: a sliding tab indicator, a character-limit progress ring, button press feedback, animated counters, an emoji picker, an image lightbox and modals with spring animations.
- **Light and dark themes** with no flash on load, following the OS setting by default.
- Responsive three-column layout that drops to two columns and then one.
- Accessible: semantic landmarks, a skip link, `aria-*` states, focus-trapped modals, Escape to close and support for `prefers-reduced-motion`.

---

## 🔐 Security

| Concern | Implementation |
| --- | --- |
| Passwords | bcrypt with 12 salt rounds. The hash uses `select: false`, so it is never returned. Minimum 8 characters with a letter and a number. |
| Authentication | JWT (HS256, explicit algorithm allow-list) checked by the `protect` middleware. Public routes use `optionalAuth`. |
| Authorisation | Only the author can edit or delete a post. A comment can be deleted by its author or by the post's author. All of this is enforced on the server. |
| NoSQL injection | The `sanitize` middleware strips `$`-prefixed and dotted keys from request bodies and params. All inputs are cast to strings, and ObjectIds are validated. |
| XSS | The client never puts user content into `innerHTML`: every string becomes a DOM text node through the `h()` helper. A strict **Content-Security-Policy** (`script-src 'self'`, no inline scripts) comes from Helmet. |
| Input hygiene | Control and bidi-override characters are removed, whitespace is normalised, lengths are capped and website URLs are validated. |
| Uploads | Files are held in memory, the **file type is detected from magic bytes** rather than the client's MIME type, names are random, the limit is 5 MB, they're served with `nosniff`, and old files are deleted when replaced. |
| Abuse | Rate limits apply to the API (600 per 15 min), authentication (20 per 15 min) and writes (30 per min). JSON bodies are capped at 100 KB. |
| Integrity | Likes and follows are atomic and idempotent (a `$ne` guard plus a unique compound index), so double-clicks can't inflate the counts. |

---

## 🏗️ Architecture

The backend uses a layered MVC structure: **routes → middleware → controllers → models**, with shared helpers in `utils/`.

```
CodeAlpha_Social_Media_Platform/
├── server.js                  # Entry point: connects to MongoDB, starts HTTP server
├── Backend/
│   ├── app.js                 # Express app: security headers, parsers, static, routes, errors
│   ├── seed.js                # Demo data generator (users, posts, images, likes, comments)
│   ├── config/                # env.js (validated env vars) · db.js (Mongoose connection)
│   ├── models/                # User · Post · Comment · Follow · Notification
│   ├── controllers/           # auth · user · post · comment · notification
│   ├── routes/                # REST routers + SSE stream router
│   ├── middleware/            # auth (JWT) · upload (multer) · sanitize · rateLimits · errorHandler
│   ├── utils/                 # AppError · asyncHandler · sanitize · token · files · serialize · notify · realtime
│   └── tests/api.test.js      # 28 integration tests (node:test + supertest)
├── Frontend/                  # Static SPA served by Express
│   ├── index.html
│   ├── css/styles.css         # Design system: tokens, components, animations, dark mode
│   ├── img/logo.svg
│   └── js/
│       ├── app.js             # Routes, app chrome (topbar / sidebars / dock), boot
│       ├── router.js          # Hash router with per-view teardown
│       ├── api.js             # Fetch wrapper + typed API client
│       ├── store.js           # Tiny reactive store + event bus
│       ├── realtime.js        # EventSource client → live DOM updates
│       ├── session.js · theme.js · theme-init.js
│       ├── dom.js             # Safe h() builder, icons, avatars, rich text, formatting
│       ├── ui.js              # Toasts, modals, dropdowns, skeletons, form helpers
│       ├── components/        # postCard · comments · composer · postList · follow · userRow
│       └── views/             # auth · feed · profile · misc (post, activity, search, settings)
└── uploads/                   # avatars/ and posts/ (user content, git-ignored)
```

### Data model

```
User ─┬─< Post ──< Comment (parent → Comment, one level)
      ├─< Follow >─ User        (unique follower+following)
      └─< Notification          (like · comment · reply · follow)
```

- `Post.likes` holds an array of user ids (`select: false`) next to a denormalised `likesCount`. Likes are toggled atomically.
- `User.followersCount`, `followingCount` and `postsCount` are denormalised counters kept up to date with `$inc`.
- Feeds use **cursor pagination on `_id`** (newest first), which stays fast and stable while new posts arrive.

---

## 🚀 Getting started

### Prerequisites
- **Node.js 20.13+**
- **MongoDB 6+**, running locally or on Atlas

### Install and run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # then edit MONGO_URI / JWT_SECRET if needed

# 3. (Optional) load demo data. WARNING: wipes the database in MONGO_URI
npm run seed

# 4. Start the server
npm run dev                 # auto-restarts on change
# or
npm start
```

Then open **http://localhost:5000**.

### Demo accounts (after `npm run seed`)

| Username | Password |
| --- | --- |
| `amina`, `omar`, `layla`, `yusuf`, `sara`, `hassan` | `Password123` |

Tip: open two browsers logged in as different users to watch likes, comments, follows and new-post alerts update in real time.

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `production` requires `JWT_SECRET` and hides 500 error details |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/codealpha_social` | MongoDB connection string |
| `JWT_SECRET` | – | Long random secret used to sign tokens |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |

### Tests

```bash
npm test
```

This runs 28 integration tests covering auth, validation, injection attempts, uploads (including fake images), follows, feeds, pagination, likes, comments and replies, permissions, cascading deletes and security headers. The tests use a throwaway database (`codealpha_social_test_tmp`) that is dropped afterwards. Override it with `TEST_MONGO_URI`.

---

## 📡 REST API

All responses are JSON in the form `{ success, ... }`. Errors look like `{ success: false, message, details? }`.
🔒 means the route needs `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account → `{ token, user }` |
| POST | `/api/auth/login` | Log in with `{ identifier, password }` |
| GET 🔒 | `/api/auth/me` | Current user + unread activity count |
| PATCH 🔒 | `/api/auth/password` | Change password |
| GET | `/api/users/search?q=` | Search people by name or username |
| GET 🔒 | `/api/users/suggestions` | Who-to-follow suggestions |
| PATCH 🔒 | `/api/users/me` | Update profile (multipart: `avatar`, `name`, `username`, `bio`, `location`, `website`, `removeAvatar`) |
| GET | `/api/users/:username` | Public profile (+ `isFollowing`, `followsYou` when logged in) |
| GET | `/api/users/:username/posts?cursor=` | A user's posts |
| GET | `/api/users/:username/followers` · `/following` | Connection lists (`?page=`) |
| POST 🔒 / DELETE 🔒 | `/api/users/:username/follow` | Follow / unfollow |
| GET | `/api/posts/feed?mode=following\|explore&cursor=` | Home feed (🔒 for `following`) or global feed |
| POST 🔒 | `/api/posts` | Create a post (multipart: `text`, `image`) |
| GET | `/api/posts/:id` | Single post |
| PATCH 🔒 / DELETE 🔒 | `/api/posts/:id` | Edit (`text`, `image`, `removeImage`) / delete (author only) |
| POST 🔒 / DELETE 🔒 | `/api/posts/:id/like` | Like / unlike (idempotent) |
| GET | `/api/posts/:id/likes` | Users who liked |
| GET | `/api/posts/:id/comments` | Comments + replies |
| POST 🔒 | `/api/posts/:id/comments` | Add a comment `{ text, parentId? }` |
| DELETE 🔒 | `/api/posts/:id/comments/:commentId` | Delete comment (and its replies) |
| GET 🔒 | `/api/notifications?cursor=` | Activity feed |
| GET 🔒 | `/api/notifications/unread-count` | Unread count |
| PATCH 🔒 | `/api/notifications/read` | Mark all as read |
| GET | `/api/stream?token=` | Server-Sent Events: `post:stats`, `post:new`, `feed:new`, `post:updated`, `post:deleted`, `comment:new`, `comment:deleted`, `notification` |
| GET | `/api/health` | Health check |

---

## 🧭 Design decisions

- **No front-end framework or build step.** ES modules load straight in the browser, which keeps the project light and makes the DOM logic easy to read. A small `h()` helper gives JSX-like ergonomics and is safe against XSS by construction.
- **SSE instead of WebSockets.** Every real-time feature here sends data from server to client, so SSE is enough. It runs over plain HTTP, reconnects automatically and needs no extra dependency.
- **Denormalised counters.** They keep feed reads to a single query. Writes use atomic `$inc` with guards, so the counters stay consistent.
- **Optimistic UI everywhere.** Likes and follows update immediately and roll back with a toast if the request fails.

---

## 📄 License

MIT © 2026 Muad Ahmed Hassan. Built for the **CodeAlpha** Full Stack Development Internship.
