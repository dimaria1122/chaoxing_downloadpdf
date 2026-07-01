const TRAILING_CHARS = /[\s"'`),;\]}<>]+$/;

export function extractResources(text, options = {}) {
  if (!text || typeof text !== 'string') return [];

  const sourceUrl = options.sourceUrl || '';
  const normalized = decodeText(text);
  const candidates = [];

  collectFieldUrls(normalized, candidates);
  collectDirectUrls(normalized, candidates);

  const seen = new Set();
  return candidates
    .map((url) => normalizeUrl(url))
    .filter(Boolean)
    .filter((url) => isDocumentLikeUrl(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((url) => ({
      id: stableId(url),
      url,
      kind: classifyResource(url),
      sourceUrl
    }));
}

export function filenameFromResource(resource) {
  const fallback = resource.kind === 'pdf' ? 'chaoxing-courseware.pdf' : 'chaoxing-courseware';
  try {
    const url = new URL(resource.url);
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (!last) return fallback;
    const decoded = decodeURIComponent(last);
    const safe = decoded.replace(/[\\/:*?"<>|]+/g, '_').trim();
    if (!safe) return fallback;
    if (resource.kind === 'pdf' && !safe.toLowerCase().endsWith('.pdf')) return `${safe}.pdf`;
    return safe;
  } catch {
    return fallback;
  }
}

export function sortResources(resources) {
  return [...resources].sort((left, right) => {
    const scoreDelta = resourceScore(right) - resourceScore(left);
    if (scoreDelta !== 0) return scoreDelta;
    return (right.foundAt || 0) - (left.foundAt || 0);
  });
}

export function classifyResource(resourceUrl) {
  const url = safeUrl(resourceUrl);
  const path = url?.pathname.toLowerCase() || String(resourceUrl || '').toLowerCase();

  if (path.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(path)) return 'image';
  if (/\.(m?js|css)$/.test(path)) return 'script';
  if (/\.(pptx?|docx?|xlsx?)$/.test(path)) return 'document';
  return 'download';
}

export function isKnownUnavailable(resource) {
  return resource?.status === 'forbidden' || resource?.status === 'missing';
}

function collectFieldUrls(text, candidates) {
  const fieldPattern = /(?:pdf|download|file)\s*[:=]\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(fieldPattern)) {
    candidates.push(match[1]);
  }
}

function collectDirectUrls(text, candidates) {
  const directPattern = /(?:https?:)?\/\/[^\s"'<>]+/gi;
  for (const match of text.matchAll(directPattern)) {
    candidates.push(match[0]);
  }
}

function decodeText(text) {
  return text
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  let value = decodeText(String(rawUrl)).trim().replace(TRAILING_CHARS, '');
  if (value.startsWith('//')) value = `https:${value}`;
  try {
    return new URL(value).toString();
  } catch {
    return '';
  }
}

function isDocumentLikeUrl(url) {
  const lower = url.toLowerCase();
  return lower.includes('.pdf') || lower.includes('/download/') || lower.includes('ananas');
}

function resourceScore(resource) {
  let score = 0;
  const url = safeUrl(resource.url);
  const host = url?.hostname || '';
  const path = url?.pathname.toLowerCase() || '';
  const kind = resource.kind || classifyResource(resource.url);

  if (kind === 'pdf') score += 2000;
  if (kind === 'document') score += 1000;
  if (kind === 'image') score += 100;
  if (kind === 'script') score -= 500;
  if (resource.status === 'ok') score += 300;
  if (resource.status === 'checking') score += 100;
  if (resource.status === 'forbidden' || resource.status === 'missing') score -= 1000;
  if (host === 'mooc1.chaoxing.com' || host.startsWith('mooc1-')) score += 100;
  if (host.includes('pan-yz.chaoxing.com')) score -= 50;
  if (path.includes('/download/')) score -= 100;
  return score;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function stableId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
