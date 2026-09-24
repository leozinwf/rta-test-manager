(() => {
  if (window.__RTA_NETWORK_RECORDER_BRIDGE__) return;
  window.__RTA_NETWORK_RECORDER_BRIDGE__ = true;

  const SOURCE_PAGE = 'rta-network-recorder-page';
  const SOURCE_UI = 'rta-network-recorder-ui';
  const MAX_TEXT = 500000;
  let recording = false;
  let sequence = 0;

  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  function emit(payload) {
    window.postMessage({ source: SOURCE_PAGE, ...payload }, '*');
  }

  function headersToObject(headers) {
    const result = {};
    try {
      new Headers(headers || {}).forEach((value, key) => result[key] = value);
    } catch (_) {}
    return result;
  }

  function bodyToValue(body) {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      const result = {};
      body.forEach((value, key) => {
        const formatted = value instanceof File
          ? `[File: ${value.name}, ${value.type || 'unknown'}, ${value.size} bytes]`
          : String(value);
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] = Array.isArray(result[key]) ? [...result[key], formatted] : [result[key], formatted];
        } else result[key] = formatted;
      });
      return result;
    }
    if (body instanceof Blob) return `[Blob: ${body.type || 'unknown'}, ${body.size} bytes]`;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return '[Binary request body]';
    try { return JSON.parse(JSON.stringify(body)); }
    catch (_) { return String(body); }
  }

  function trimText(text) {
    if (typeof text !== 'string') return text;
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[TRUNCATED]` : text;
  }

  async function readFetchRequestBody(request, init) {
    if (init && Object.prototype.hasOwnProperty.call(init, 'body')) return bodyToValue(init.body);
    if (!request || /^(GET|HEAD)$/i.test(request.method)) return null;
    try { return trimText(await request.clone().text()); }
    catch (_) { return '[Request body unavailable]'; }
  }

  async function readFetchResponseBody(response) {
    const contentType = response.headers.get('content-type') || '';
    const length = response.headers.get('content-length');
    if (/application\/pdf|image\/|audio\/|video\/|octet-stream|zip|gzip/i.test(contentType)) {
      return `[Binary response: ${contentType || 'unknown'}${length ? `, ${length} bytes` : ''}]`;
    }
    try { return trimText(await response.clone().text()); }
    catch (_) { return '[Response body unavailable]'; }
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== SOURCE_UI) return;
    if (event.data.action === 'start') recording = true;
    if (event.data.action === 'stop') recording = false;
    if (event.data.action === 'state') emit({ action: 'state', recording });
  });

  window.fetch = async function(input, init = {}) {
    if (!recording) return originalFetch.apply(this, arguments);

    const id = ++sequence;
    const started = performance.now();
    const request = input instanceof Request ? input : null;
    const url = request?.url || String(input);
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    const requestHeaders = {
      ...headersToObject(request?.headers),
      ...headersToObject(init.headers)
    };
    const requestBody = await readFetchRequestBody(request, init);

    emit({
      action: 'request',
      entry: {
        id, transport: 'fetch', method, url,
        startedAt: new Date().toISOString(),
        requestHeaders, requestBody
      }
    });

    try {
      const response = await originalFetch.apply(this, arguments);
      emit({
        action: 'response',
        id,
        patch: {
          status: response.status,
          statusText: response.statusText,
          responseHeaders: headersToObject(response.headers),
          responseBody: await readFetchResponseBody(response),
          durationMs: Math.round(performance.now() - started)
        }
      });
      return response;
    } catch (error) {
      emit({
        action: 'response',
        id,
        patch: {
          error: String(error?.message || error),
          durationMs: Math.round(performance.now() - started)
        }
      });
      throw error;
    }
  };

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__rtaNetworkMeta = {
      method: String(method || 'GET').toUpperCase(),
      url: String(url),
      headers: {}
    };
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this.__rtaNetworkMeta) this.__rtaNetworkMeta.headers[name] = value;
    return originalXhrSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (!recording || !this.__rtaNetworkMeta) return originalXhrSend.apply(this, arguments);

    const id = ++sequence;
    const started = performance.now();
    const meta = this.__rtaNetworkMeta;
    let absoluteUrl = meta.url;
    try { absoluteUrl = new URL(meta.url, location.href).href; } catch (_) {}

    emit({
      action: 'request',
      entry: {
        id, transport: 'xhr', method: meta.method, url: absoluteUrl,
        startedAt: new Date().toISOString(),
        requestHeaders: meta.headers,
        requestBody: bodyToValue(body)
      }
    });

    this.addEventListener('loadend', () => {
      const responseHeaders = {};
      try {
        (this.getAllResponseHeaders() || '').trim().split(/[\r\n]+/).filter(Boolean).forEach(line => {
          const index = line.indexOf(':');
          if (index > 0) responseHeaders[line.slice(0, index).trim()] = line.slice(index + 1).trim();
        });
      } catch (_) {}

      let responseBody = '[Response body unavailable]';
      try {
        if (!this.responseType || this.responseType === 'text') responseBody = trimText(this.responseText);
        else if (this.responseType === 'json') responseBody = JSON.stringify(this.response);
        else responseBody = `[Binary response: ${this.responseType}]`;
      } catch (_) {}

      emit({
        action: 'response',
        id,
        patch: {
          status: this.status,
          statusText: this.statusText,
          responseHeaders,
          responseBody,
          durationMs: Math.round(performance.now() - started)
        }
      });
    }, { once: true });

    return originalXhrSend.apply(this, arguments);
  };
})();