(() => {
  if (window.__chaoxingPdfDownloaderHooked) return;
  window.__chaoxingPdfDownloaderHooked = true;

  const TRAILING_CHARS = /[\s"'`),;\]}<>]+$/;

  patchFetch();
  patchXhr();
  scheduleDomScans();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'CHA0XING_PDF_SCAN') {
      scanText(document.documentElement?.innerHTML || '', location.href);
    }
  });

  function patchFetch() {
    if (typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(...args) {
      const response = await originalFetch.apply(this, args);
      const sourceUrl = requestUrl(args[0]) || response.url || location.href;
      readResponseText(response.clone(), sourceUrl);
      return response;
    };
  }

  function patchXhr() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__chaoxingPdfDownloaderUrl = absoluteUrl(url);
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      this.addEventListener('load', () => {
        const sourceUrl = this.responseURL || this.__chaoxingPdfDownloaderUrl || location.href;
        if (this.responseType && this.responseType !== 'text' && this.responseType !== 'json') return;
        try {
          const text = typeof this.responseText === 'string'
            ? this.responseText
            : JSON.stringify(this.response);
          scanText(text, sourceUrl);
        } catch {
          // Some XHR responses reject responseText access. Page behavior must stay untouched.
        }
      });
      return originalSend.apply(this, args);
    };
  }

  async function readResponseText(response, sourceUrl) {
    try {
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType && !/json|javascript|text|html|xml/i.test(contentType)) return;
      const text = await response.text();
      scanText(text, sourceUrl);
    } catch {
      // Ignore unreadable or streaming responses.
    }
  }

  function scanText(text, sourceUrl) {
    const resources = extractResources(text, { sourceUrl });
    for (const resource of resources) {
      window.postMessage({
        type: 'CHA0XING_PDF_RESOURCE',
        payload: {
          ...resource,
          foundAt: Date.now()
        }
      }, '*');
    }
  }

  function scheduleDomScans() {
    const scan = () => scanText(document.documentElement?.innerHTML || '', location.href);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scan, { once: true });
    } else {
      queueMicrotask(scan);
    }
    window.addEventListener('load', scan, { once: true });
    setTimeout(scan, 1500);
  }

  function extractResources(text, options = {}) {
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
        kind: url.toLowerCase().includes('.pdf') ? 'pdf' : 'download',
        sourceUrl
      }));
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
      return new URL(value, location.href).toString();
    } catch {
      return '';
    }
  }

  function isDocumentLikeUrl(url) {
    const lower = url.toLowerCase();
    return lower.includes('.pdf') || lower.includes('/download/') || lower.includes('ananas');
  }

  function requestUrl(input) {
    if (typeof input === 'string') return absoluteUrl(input);
    if (input instanceof URL) return input.toString();
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function absoluteUrl(value) {
    try {
      return new URL(value, location.href).toString();
    } catch {
      return '';
    }
  }

  function stableId(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }
})();
