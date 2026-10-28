const HASHTAG_RE = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,50})/gu;
const MAX_TAGS = 10;

/** Lower-cased, de-duplicated hashtags (without the `#`) found in `text`. */
function extractHashtags(text = '') {
  const tags = new Set();
  for (const match of text.matchAll(HASHTAG_RE)) {
    tags.add(match[1].toLowerCase());
    if (tags.size >= MAX_TAGS) break;
  }
  return [...tags];
}

function normalizeTag(tag = '') {
  const t = String(tag).trim().replace(/^#/, '').toLowerCase();
  return /^[\p{L}\p{N}_]{2,50}$/u.test(t) ? t : null;
}

module.exports = { extractHashtags, normalizeTag };
