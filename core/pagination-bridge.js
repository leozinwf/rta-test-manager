(() => {
  'use strict';
  if (window.__RTA_PAGE_SIZE_BRIDGE__) return;
  window.__RTA_PAGE_SIZE_BRIDGE__ = true;

  let requestedSize = null;
  let learning = false;
  const paginationTargets = new Set();
  const xhrRequests = new WeakMap();
  const PAGE_KEYS = new Set([
    'size', 'pagesize', 'page_size', 'limit', 'perpage', 'per_page',
    'itemsperpage', 'items_per_page', 'rowsperpage', 'rows_per_page',
    'recordsperpage', 'records_per_page', 'take'
  ]);

  const isPageKey = key => PAGE_KEYS.has(String(key).replace(/[-\s]/g, '').toLowerCase()) ||
    PAGE_KEYS.has(String(key).toLowerCase());
  const notify = (action, size) => window.postMessage({ source: 'rta-page-size-page', action, size }, '*');

  function objectHasPageKey(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(item => objectHasPageKey(item, seen));
    return Object.keys(value).some(key =>
      (isPageKey(key) && (typeof value[key] === 'number' || /^\d+$/.test(String(value[key])))) ||
      objectHasPageKey(value[key], seen)
    );
  }

  function rewriteObject(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => rewriteObject(item, seen));
      return value;
    }
    for (const key of Object.keys(value)) {
      if (isPageKey(key) && (typeof value[key] === 'number' || /^\d+$/.test(String(value[key])))) {
        value[key] = typeof value[key] === 'string' ? String(requestedSize) : requestedSize;
      } else {
        rewriteObject(value[key], seen);
      }
    }
    return value;
  }

  function rewriteUrl(input) {
    if (!requestedSize) return input;
    try {
      const url = new URL(String(input), location.href);
      let changed = false;
      for (const [key, value] of [...url.searchParams.entries()]) {
        if (isPageKey(key) && /^\d+$/.test(value)) {
          url.searchParams.set(key, String(requestedSize));
          changed = true;
        }
      }
      return changed ? url.href : input;
    } catch (_) {
      return input;
    }
  }

  function rewriteBody(body) {
    if (!requestedSize || body == null) return body;
    if (body instanceof URLSearchParams) {
      const copy = new URLSearchParams(body);
      for (const [key, value] of [...copy.entries()]) {
        if (isPageKey(key) && /^\d+$/.test(value)) copy.set(key, String(requestedSize));
      }
      return copy;
    }
    if (typeof body !== 'string') return body;
    try {
      const parsed = JSON.parse(body);
      rewriteObject(parsed);
      return JSON.stringify(parsed);
    } catch (_) {
      try {
        const params = new URLSearchParams(body);
        let changed = false;
        for (const [key, value] of [...params.entries()]) {
          if (isPageKey(key) && /^\d+$/.test(value)) {
            params.set(key, String(requestedSize));
            changed = true;
          }
        }
        return changed ? params.toString() : body;
      } catch (_) {
        return body;
      }
    }
  }

  function bodyHasPageKey(body) {
    if (body == null) return false;
    if (body instanceof URLSearchParams) {
      return [...body.entries()].some(([key, value]) => isPageKey(key) && /^\d+$/.test(value));
    }
    if (typeof body !== 'string') return false;
    try {
      return objectHasPageKey(JSON.parse(body));
    } catch (_) {
      try {
        return [...new URLSearchParams(body).entries()].some(([key, value]) => isPageKey(key) && /^\d+$/.test(value));
      } catch (_) {
        return false;
      }
    }
  }

  function urlHasPageKey(input) {
    try {
      const url = new URL(String(input), location.href);
      return [...url.searchParams.entries()].some(([key, value]) => isPageKey(key) && /^\d+$/.test(value));
    } catch (_) {
      return false;
    }
  }

  function requestTarget(method, input) {
    try {
      const url = new URL(String(input), location.href);
      return `${String(method || 'GET').toUpperCase()} ${url.origin}${url.pathname}`;
    } catch (_) {
      return '';
    }
  }

  function shouldRewrite(method, input, body) {
    const target = requestTarget(method, input);
    const hasPageKey = urlHasPageKey(input) || bodyHasPageKey(body);
    if (!target || !hasPageKey) return false;
    if (learning) {
      paginationTargets.add(target);
      learning = false;
      notify('learned');
      return false;
    }
    const rewrite = requestedSize != null && paginationTargets.has(target);
    if (rewrite) notify('rewritten', requestedSize);
    return rewrite;
  }

  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = input instanceof Request ? input.url : input;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const body = init?.body;
    if (!shouldRewrite(method, url, body)) return originalFetch.apply(this, arguments);
    if (input instanceof Request) {
      const rewrittenRequest = new Request(rewriteUrl(input.url), input);
      const rewrittenInit = init?.body != null ? { ...init, body: rewriteBody(init.body) } : init;
      return originalFetch.call(this, rewrittenRequest, rewrittenInit);
    }
    return originalFetch.call(this, rewriteUrl(input), init ? { ...init, body: rewriteBody(init.body) } : init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    const args = [...arguments];
    if (learning && urlHasPageKey(url)) shouldRewrite(method, url, null);
    if (requestedSize != null && paginationTargets.has(requestTarget(method, url)) && urlHasPageKey(url)) {
      notify('rewritten', requestedSize);
      args[1] = rewriteUrl(url);
    }
    xhrRequests.set(this, { method, url });
    return originalOpen.apply(this, args);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    const request = xhrRequests.get(this) || {};
    if (!shouldRewrite(request.method, request.url, body)) return originalSend.call(this, body);
    return originalSend.call(this, rewriteBody(body));
  };

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'rta-page-size') return;
    if (event.data.action === 'learn') {
      requestedSize = null;
      learning = true;
      paginationTargets.clear();
    } else if (event.data.action === 'clear') {
      requestedSize = null;
      learning = false;
      paginationTargets.clear();
    } else if (event.data.action === 'apply') {
      const size = Number(event.data.size);
      requestedSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : null;
      learning = false;
    } else {
      return;
    }
    window.postMessage({ source: 'rta-page-size-page', token: event.data.token }, '*');
  });
})();
