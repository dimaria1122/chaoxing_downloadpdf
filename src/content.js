window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'CHA0XING_PDF_RESOURCE') return;

  const resource = event.data.payload;
  if (!resource || typeof resource.url !== 'string') return;

  chrome.runtime.sendMessage({
    type: 'resourceFound',
    resource
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'scanPage') {
    window.postMessage({ type: 'CHA0XING_PDF_SCAN' }, '*');
  }
});
