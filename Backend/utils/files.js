const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const AppError = require('./AppError');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Identify images by their magic bytes rather than trusting the client's MIME type.
const SIGNATURES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'gif', test: (b) => b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a' },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const match = SIGNATURES.find((sig) => sig.test(buffer));
  return match ? match.ext : null;
}

/** Validates an in-memory upload and writes it to /uploads/<folder>. Returns its public URL. */
async function saveImage(file, folder) {
  const ext = detectImageType(file.buffer);
  if (!ext) throw new AppError('Only JPG, PNG, GIF or WEBP images are allowed', 415);
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const dir = path.join(UPLOAD_ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), file.buffer);
  return `/uploads/${folder}/${name}`;
}

/** Deletes a previously saved upload. Ignores anything outside /uploads. */
async function removeImage(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const target = path.resolve(UPLOAD_ROOT, publicUrl.replace(/^\/uploads\//, ''));
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) return;
  await fs.unlink(target).catch(() => {});
}

module.exports = { saveImage, removeImage, detectImageType, UPLOAD_ROOT };
