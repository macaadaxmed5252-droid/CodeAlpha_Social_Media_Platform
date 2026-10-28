const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const AppError = require('./AppError');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const MB = 1024 * 1024;
const LIMITS = { image: 5 * MB, video: 25 * MB };

// Identify files by their magic bytes rather than trusting the client's MIME type.
const SIGNATURES = [
  { type: 'image', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image', ext: 'gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) },
  { type: 'image', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { type: 'video', ext: 'webm', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  {
    type: 'video',
    // ISO base media (MP4 / MOV): "ftyp" box at offset 4, brand tells them apart.
    ext: 'mp4',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
    resolveExt: (b) => (b.subarray(8, 10).toString('ascii') === 'qt' ? 'mov' : 'mp4'),
  },
];

function detectMedia(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const sig = SIGNATURES.find((s) => s.test(buffer));
  if (!sig) return null;
  return { type: sig.type, ext: sig.resolveExt ? sig.resolveExt(buffer) : sig.ext };
}

/**
 * Validates an in-memory upload and writes it to /uploads/<folder>.
 * `allow` lists the accepted media kinds. Returns `{ type, url }`.
 */
async function saveMedia(file, folder, { allow = ['image'] } = {}) {
  const detected = detectMedia(file.buffer);
  if (!detected || !allow.includes(detected.type)) {
    const what = allow.includes('video') ? 'JPG, PNG, GIF, WEBP images or MP4, WEBM, MOV videos' : 'JPG, PNG, GIF or WEBP images';
    throw new AppError(`Only ${what} are allowed`, 415);
  }
  if (file.buffer.length > LIMITS[detected.type]) {
    throw new AppError(detected.type === 'video' ? 'Videos must be 25 MB or smaller' : 'Images must be 5 MB or smaller', 413);
  }
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${detected.ext}`;
  const dir = path.join(UPLOAD_ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), file.buffer);
  return { type: detected.type, url: `/uploads/${folder}/${name}` };
}

async function saveImage(file, folder) {
  return (await saveMedia(file, folder, { allow: ['image'] })).url;
}

/** Deletes a previously saved upload. Ignores anything outside /uploads. */
async function removeFile(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const target = path.resolve(UPLOAD_ROOT, publicUrl.replace(/^\/uploads\//, ''));
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) return;
  await fs.unlink(target).catch(() => {});
}

module.exports = { saveMedia, saveImage, removeFile, removeImage: removeFile, detectMedia, UPLOAD_ROOT, LIMITS };
