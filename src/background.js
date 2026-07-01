import { filenameFromResource, sortResources } from './parser.js';

const resourcesByTab = new Map();
const validationByUrl = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  resourcesByTab.delete(tabId);
});

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== 'string') {
    return { ok: false, error: 'Unknown message' };
  }

  switch (message.type) {
    case 'resourceFound':
      return handleResourceFound(message.resource, sender);
    case 'getResources':
      return handleGetResources(message.tabId);
    case 'downloadResource':
      return handleDownloadResource(message.resource);
    case 'openResource':
      return handleOpenResource(message.resource);
    case 'clearResources':
      return handleClearResources(message.tabId);
    default:
      return { ok: false, error: `Unsupported message type: ${message.type}` };
  }
}

function handleResourceFound(resource, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !isValidResource(resource)) {
    return { ok: false, error: 'Invalid resource' };
  }

  const existing = resourcesByTab.get(tabId) || [];
  const nextResource = {
    ...resource,
    id: resource.id || stableId(resource.url),
    status: validationByUrl.get(resource.url)?.status || resource.status || 'checking',
    statusCode: validationByUrl.get(resource.url)?.statusCode || resource.statusCode || null,
    foundAt: resource.foundAt || Date.now()
  };
  const index = existing.findIndex((item) => item.url === nextResource.url);
  if (index >= 0) {
    existing[index] = { ...existing[index], ...nextResource };
  } else {
    existing.unshift(nextResource);
  }
  resourcesByTab.set(tabId, sortResources(existing).slice(0, 100));
  validateResource(nextResource.url);

  return { ok: true, count: resourcesByTab.get(tabId).length };
}

function handleGetResources(tabId) {
  if (!Number.isInteger(tabId)) return { ok: true, resources: [] };
  return { ok: true, resources: sortResources(resourcesByTab.get(tabId) || []) };
}

async function handleDownloadResource(resource) {
  if (!isValidResource(resource)) {
    return { ok: false, error: 'Invalid download URL' };
  }
  const downloadId = await chrome.downloads.download({
    url: resource.url,
    filename: `chaoxing/${filenameFromResource(resource)}`,
    saveAs: false
  });
  return { ok: true, downloadId };
}

async function handleOpenResource(resource) {
  if (!isValidResource(resource)) {
    return { ok: false, error: 'Invalid resource URL' };
  }
  const tab = await chrome.tabs.create({ url: resource.url, active: true });
  return { ok: true, tabId: tab.id };
}

function handleClearResources(tabId) {
  if (Number.isInteger(tabId)) resourcesByTab.delete(tabId);
  return { ok: true, resources: [] };
}

function isValidResource(resource) {
  if (!resource || typeof resource.url !== 'string') return false;
  try {
    const url = new URL(resource.url);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function validateResource(url) {
  if (validationByUrl.get(url)?.status === 'checking') return;

  validationByUrl.set(url, { status: 'checking', statusCode: null });
  applyValidation(url, { status: 'checking', statusCode: null });

  const result = await checkResourceAccess(url);
  validationByUrl.set(url, result);
  applyValidation(url, result);
}

async function checkResourceAccess(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Range: 'bytes=0-0'
      },
      signal: controller.signal
    });
    response.body?.cancel?.()?.catch?.(() => {});
    return {
      status: accessStatus(response.status),
      statusCode: response.status
    };
  } catch {
    return { status: 'unknown', statusCode: null };
  } finally {
    clearTimeout(timeout);
  }
}

function accessStatus(statusCode) {
  if (statusCode >= 200 && statusCode < 400) return 'ok';
  if (statusCode === 401 || statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'missing';
  return 'error';
}

function applyValidation(url, result) {
  for (const [tabId, resources] of resourcesByTab.entries()) {
    const next = resources.map((resource) => (
      resource.url === url
        ? { ...resource, status: result.status, statusCode: result.statusCode }
        : resource
    ));
    resourcesByTab.set(tabId, sortResources(next));
  }
}

function stableId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
