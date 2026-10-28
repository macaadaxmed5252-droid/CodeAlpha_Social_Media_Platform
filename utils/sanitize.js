const mongoose = require('mongoose');
const AppError = require('./AppError');

// Control characters except tab / newline / carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

// Script/style blocks (with their contents), comments and any other tag.
// Tags require a letter after `<`, so "a < b" or "<3" survive.
const HTML_TAGS = /<(script|style)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<\/?[a-z][^<>]*>/gi;

/**
 * Normalises user-supplied text: forces a string, strips HTML tags and
 * invisible/control characters, collapses runs of blank lines and trims.
 * This is defence in depth - the client also renders everything as text nodes.
 */
function cleanText(value, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  let s = String(value).normalize('NFC').replace(CONTROL_CHARS, '').replace(HTML_TAGS, '');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  return s.trim();
}

/** Recursively drops keys that could be interpreted as MongoDB operators. */
function stripOperators(obj) {
  if (Array.isArray(obj)) return obj.map(stripOperators);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      out[key] = stripOperators(val);
    }
    return out;
  }
  return obj;
}

function isObjectId(id) {
  return typeof id === 'string' && mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id);
}

function assertObjectId(id, label = 'Resource') {
  if (!isObjectId(id)) throw new AppError(`${label} not found`, 404);
  return id;
}

function cleanUrl(value) {
  const s = cleanText(value);
  if (!s) return '';
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withProto);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error('bad');
    return url.toString();
  } catch {
    throw new AppError('Please provide a valid website URL', 422);
  }
}

module.exports = { cleanText, stripOperators, isObjectId, assertObjectId, cleanUrl };
