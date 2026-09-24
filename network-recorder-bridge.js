(() => {
  if (window.__RTA_NETWORK_RECORDER_BRIDGE__) return;
  window.__RTA_NETWORK_RECORDER_BRIDGE__ = true;

  const SOURCE = 'rta-network-recorder-page';
  let recording = false;
  let seq = 0;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  const emit = detail => window.postMessage({ source: SOURCE, ...detail }, '*');
  const headersToObject = headers => {
    const out = {};
    try { new Headers(headers || {}).forEach((v,k) => out[k] = v); } catch (_) {}
    return out;
  };
  const bodyValue = body => {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      const out = {};
      body.forEach((v,k) => out[k] = v instanceof File ? '[File '+v.name+', '+v.size+' bytes]' : String(v));
      return out;
    }
    if (body instanceof Blob) return '[Blob '+(body.type || 'unknown')+', '+body.size+' bytes]';
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return '[Binary body]';
    try { return JSON.parse(JSON.stringify(body)); } catch (_) { return String(body); }
  };
  async function responseBody(response) {
    const type = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    if (/application\/pdf|image\/|audio\/|video\/|octet-stream|zip/i.test(type)) return '[Binary response: '+type+(length ? ', '+length+' bytes' : '')+']';
    try {
      const text = await response.clone().text();
      return text.length > 500000 ? text.slice(0,500000)+'\n[TRUNCATED]' : text;
    } catch (_) { return '[Response body unavailable]'; }
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'rta-network-recorder-ui') return;
    if (event.data.action === 'start') recording = true;
    if (event.data.action === 'stop') recording = false;
  });

  window.fetch = async function(input, init = {}) {
    if (!recording) return originalFetch.apply(this, arguments);
    const id = ++seq;
    const started = performance.now();
    const request = input instanceof Request ? input : null;
    const url = request?.url || String(input);
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    let requestBody = bodyValue(init.body);
    if (requestBody == null && request) {
      try { requestBody = await request.clone().text(); } catch (_) {}
    }
    const requestHeaders = { ...headersToObject(request?.headers), ...headersToObject(init.headers) };
    emit({ action:'request', entry:{ id, transport:'fetch', url, method, startedAt:new Date().toISOString(), requestHeaders, requestBody } });
    try {
      const response = await originalFetch.apply(this, arguments);
      const body = await responseBody(response);
      emit({ action:'response', id, patch:{ status:response.status, statusText:response.statusText, responseHeaders:headersToObject(response.headers), responseBody:body, durationMs:Math.round(performance.now()-started) } });
      return response;
    } catch (error) {
      emit({ action:'response', id, patch:{ error:String(error?.message || error), durationMs:Math.round(performance.now()-started) } });
      throw error;
    }
  };

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__rtaRec = { method:String(method || 'GET').toUpperCase(), url:String(url), headers:{} };
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this.__rtaRec) this.__rtaRec.headers[name] = value;
    return originalSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (!recording || !this.__rtaRec) return originalSend.apply(this, arguments);
    const id = ++seq;
    const started = performance.now();
    const meta = this.__rtaRec;
    emit({ action:'request', entry:{ id, transport:'xhr', url:new URL(meta.url, location.href).href, method:meta.method, startedAt:new Date().toISOString(), requestHeaders:meta.headers, requestBody:bodyValue(body) } });
    this.addEventListener('loadend', () => {
      const raw = this.getAllResponseHeaders?.() || '';
      const responseHeaders = {};
      raw.trim().split(/[\r\n]+/).filter(Boolean).forEach(line => { const i=line.indexOf(':'); if(i>0) responseHeaders[line.slice(0,i).trim()] = line.slice(i+1).trim(); });
      let responseBody = '[Response body unavailable]';
      try {
        if (!this.responseType || this.responseType === 'text') responseBody = this.responseText;
        else if (this.responseType === 'json') responseBody = JSON.stringify(this.response);
        else responseBody = '[Binary response: '+this.responseType+']';
        if (typeof responseBody === 'string' && responseBody.length > 500000) responseBody = responseBody.slice(0,500000)+'\n[TRUNCATED]';
      } catch (_) {}
      emit({ action:'response', id, patch:{ status:this.status, statusText:this.statusText, responseHeaders, responseBody, durationMs:Math.round(performance.now()-started) } });
    }, { once:true });
    return originalSend.apply(this, arguments);
  };
})();