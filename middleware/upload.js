const multer = require('multer');
const AppError = require('../utils/AppError');
const { LIMITS } = require('../utils/files');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

// First-line filter on the declared MIME type; utils/files.js re-checks the real bytes
// and enforces the per-kind size limit (5 MB images, 25 MB videos).
function makeUploader(allowVideo) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: allowVideo ? LIMITS.video : LIMITS.image, files: 2, fields: 12 },
    fileFilter(req, file, cb) {
      const ok = IMAGE_TYPES.has(file.mimetype) || (allowVideo && VIDEO_TYPES.has(file.mimetype));
      if (!ok) {
        const what = allowVideo ? 'images (JPG, PNG, GIF, WEBP) or videos (MP4, WEBM, MOV)' : 'JPG, PNG, GIF or WEBP images';
        return cb(new AppError(`Only ${what} are allowed`, 415));
      }
      cb(null, true);
    },
  });
}

const mediaUploader = makeUploader(true);
const imageUploader = makeUploader(false);

function wrap(handler, allowVideo) {
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(allowVideo ? 'Files must be 25 MB or smaller (images 5 MB)' : 'Images must be 5 MB or smaller', 413));
        }
        return next(new AppError(`Upload error: ${err.message}`, 400));
      }
      next(err);
    });
}

/** One optional image or video for a post, under the `media` field. */
const postMedia = () => wrap(mediaUploader.single('media'), true);

/** Optional `avatar` and `banner` images for profile updates. */
const profileImages = () =>
  wrap(
    imageUploader.fields([
      { name: 'avatar', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
    ]),
    false
  );

module.exports = { postMedia, profileImages };
