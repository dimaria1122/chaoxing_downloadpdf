import { isKnownUnavailable } from './parser.js';

const state = {
  tab: null,
  resources: [],
  filter: 'all'
};

const statusEl = document.querySelector('#status');
const listEl = document.querySelector('#list');
const emptyEl = document.querySelector('#empty');
const refreshButton = document.querySelector('#refresh');
const clearButton = document.querySelector('#clear');
const filterButtons = [...document.querySelectorAll('.filter')];
let refreshTimer = null;

refreshButton.addEventListener('click', async () => {
  if (!state.tab?.id) return;
  statusEl.textContent = '正在扫描页面...';
  await chrome.tabs.sendMessage(state.tab.id, { type: 'scanPage' }).catch(() => {});
  setTimeout(loadResources, 350);
});

clearButton.addEventListener('click', async () => {
  if (!state.tab?.id) return;
  await chrome.runtime.sendMessage({ type: 'clearResources', tabId: state.tab.id });
  await loadResources();
});

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter || 'all';
    render();
  });
}

init();

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab || null;
  await loadResources();
  refreshTimer = setInterval(loadResources, 1500);
}

window.addEventListener('pagehide', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});

async function loadResources() {
  if (!state.tab?.id) {
    statusEl.textContent = '没有可读取的当前标签页。';
    render();
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: 'getResources', tabId: state.tab.id });
  state.resources = response?.resources || [];
  statusEl.textContent = state.resources.length
    ? `${tabLabel(state.tab)} - 找到 ${state.resources.length} 个资源`
    : `${tabLabel(state.tab)} - 暂未发现课件链接`;
  render();
}

function render() {
  listEl.textContent = '';
  const visibleResources = state.resources.filter(matchesFilter);
  emptyEl.hidden = visibleResources.length > 0;
  updateFilters();

  for (const resource of visibleResources) {
    const item = document.createElement('article');
    item.className = 'item';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = filenameFromResource(resource);

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = sourceLabel(resource);

    const status = document.createElement('div');
    status.className = `item-status ${resource.status || 'unchecked'}`;
    status.textContent = statusLabel(resource);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const downloadButton = actionButton('下载', () => downloadResource(resource));
    downloadButton.disabled = isKnownUnavailable(resource);

    actions.append(
      downloadButton,
      actionButton('打开', async () => {
        await chrome.runtime.sendMessage({ type: 'openResource', resource });
      }),
      actionButton('复制', async () => {
        await navigator.clipboard.writeText(resource.url);
        statusEl.textContent = '链接已复制';
      })
    );

    item.append(title, meta, status, actions);
    listEl.append(item);
  }
}

function matchesFilter(resource) {
  if (state.filter === 'all') return true;
  if (state.filter === 'other') {
    return resource.kind !== 'pdf' && resource.kind !== 'image' && resource.kind !== 'script';
  }
  return resource.kind === state.filter;
}

function updateFilters() {
  for (const button of filterButtons) {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  }
}

function actionButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onClick();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

async function downloadResource(resource) {
  const response = await chrome.runtime.sendMessage({ type: 'downloadResource', resource });
  if (!response?.ok) {
    statusEl.textContent = response?.error || '下载失败';
    return;
  }
  statusEl.textContent = '已发送到 Chrome 下载列表';
}

function sourceLabel(resource) {
  try {
    const url = new URL(resource.sourceUrl || resource.url);
    return `${resource.kind || 'resource'} - ${url.hostname}`;
  } catch {
    return resource.kind || 'resource';
  }
}

function statusLabel(resource) {
  const suffix = resource.statusCode ? ` (${resource.statusCode})` : '';
  switch (resource.status) {
    case 'ok':
      return `可下载${suffix}`;
    case 'checking':
      return '验证中...';
    case 'forbidden':
      return `不可用/无权限${suffix}`;
    case 'missing':
      return `链接不存在${suffix}`;
    case 'error':
    case 'unknown':
      return '未能验证，可尝试下载';
    default:
      return '未验证';
  }
}

function filenameFromResource(resource) {
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

function tabLabel(tab) {
  try {
    const url = new URL(tab.url);
    return url.hostname || '当前标签页';
  } catch {
    return '当前标签页';
  }
}
