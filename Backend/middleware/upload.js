const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) return cb(new AppError('Only JPG, PNG, GIF or WEBP images are allowed', 415));
    cb(null, true);
  },
});

/** Accepts one optional image under `field`, translating multer errors into API errors. */
function singleImage(field) {
  const handler = uploader.single(field);
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller' : `Upload error: ${err.message}`;
        return next(new AppError(message, err.code === 'LIMIT_FILE_SIZE' ? 413 : 400));
      }
      next(err);
    });
}

module.exports = { singleImage, MAX_BYTES };
