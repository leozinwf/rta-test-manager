(() => {
  if (window.__RTA_NETWORK_RECORDER_UI__) return;
  window.__RTA_NETWORK_RECORDER_UI__ = true;

  const SOURCE_PAGE = 'rta-network-recorder-page';
  const SOURCE_UI = 'rta-network-recorder-ui';
  const entries = new Map();
  let recording = false;
  let root, panel, list, detail, statusLabel, countLabel, toggleButton, nameInput, methodFilter, textFilter;

  const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|apikey|password|passwd|senha|access_token|access-token|refresh_token|refresh-token|client_secret|client-secret|secret|x-xsrf-token|xsrf-token|x-csrf-token|csrf-token|csrf|xsrf)$/i;
  const SENSITIVE_INLINE = /((?:password|passwd|senha|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|api[_-]?key|x?[_-]?xsrf[_-]?token|x?[_-]?csrf[_-]?token)\s*["']?\s*[:=]\s*["']?)([^&\s"',}\]]+)/gi;

  function post(action) {
    window.postMessage({ source: SOURCE_UI, action }, '*');
  }

  function sanitize(value, key = '') {
    if (SENSITIVE_KEY.test(key)) return '[REMOVIDO]';
    if (Array.isArray(value)) return value.map(item => sanitize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]));
    }
    if (typeof value !== 'string') return value;

    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return JSON.stringify(sanitize(parsed), null, 2);
    } catch (_) {}

    return value.replace(SENSITIVE_INLINE, '$1[REMOVIDO]');
  }

  function safeEntry(entry) {
    return {
      ...entry,
      requestHeaders: sanitize(entry.requestHeaders || {}),
      requestBody: sanitize(entry.requestBody),
      responseHeaders: sanitize(entry.responseHeaders || {}),
      responseBody: sanitize(entry.responseBody)
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[char]);
  }

  function shortUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch (_) {
      return url;
    }
  }

  function filteredEntries() {
    const method = methodFilter?.value || 'ALL';
    const query = (textFilter?.value || '').trim().toLowerCase();
    return [...entries.values()].filter(entry => {
      if (method !== 'ALL' && entry.method !== method) return false;
      if (!query) return true;
      return `${entry.method} ${entry.url} ${entry.status || ''}`.toLowerCase().includes(query);
    });
  }

  function render() {
    if (!root) return;
    const all = [...entries.values()];
    const visible = filteredEntries();
    countLabel.textContent = String(all.length);
    statusLabel.textContent = recording ? '● Gravando' : '● Parado';
    statusLabel.classList.toggle('is-recording', recording);
    toggleButton.textContent = recording ? 'Parar' : 'Iniciar';

    list.innerHTML = visible.slice().reverse().map(entry => `
      <button type="button" class="rta-net-row" data-rta-net-id="${entry.id}">
        <b>${escapeHtml(entry.method)}</b>
        <span class="rta-net-code ${entry.status >= 400 || entry.error ? 'is-error' : ''}">${escapeHtml(entry.error ? 'ERR' : entry.status || '...')}</span>
        <span class="rta-net-url" title="${escapeHtml(entry.url)}">${escapeHtml(shortUrl(entry.url))}</span>
        <small>${entry.durationMs != null ? `${entry.durationMs} ms` : ''}</small>
      </button>
    `).join('') || '<div class="rta-net-empty">Nenhuma requisição capturada.</div>';
  }

  function showDetails(id) {
    const entry = entries.get(Number(id));
    if (!entry) return;
    detail.hidden = false;
    detail.textContent = JSON.stringify(safeEntry(entry), null, 2);
  }

  function captureObject() {
    return {
      format: 'rta-network-recorder-v1',
      name: nameInput.value.trim() || 'Captura de rede',
      capturedAt: new Date().toISOString(),
      page: location.href,
      requests: [...entries.values()].map(safeEntry)
    };
  }

  async function copyForAnalysis() {
    const data = captureObject();
    const compact = [
      `AÇÃO: ${data.name}`,
      `PÁGINA: ${data.page}`,
      `CAPTURADO EM: ${data.capturedAt}`,
      '',
      ...data.requests.flatMap((entry, index) => [
        `#${index + 1} ${entry.method} ${entry.url}`,
        `TRANSPORTE: ${entry.transport} | STATUS: ${entry.status ?? entry.error ?? 'pendente'} | DURAÇÃO: ${entry.durationMs ?? '-'} ms`,
        'REQUEST HEADERS:',
        JSON.stringify(entry.requestHeaders || {}, null, 2),
        'REQUEST BODY:',
        typeof entry.requestBody === 'string' ? entry.requestBody : JSON.stringify(entry.requestBody, null, 2),
        'RESPONSE HEADERS:',
        JSON.stringify(entry.responseHeaders || {}, null, 2),
        'RESPONSE BODY:',
        typeof entry.responseBody === 'string' ? entry.responseBody : JSON.stringify(entry.responseBody, null, 2),
        '\n----------------------------------------\n'
      ])
    ].join('\n');
    await navigator.clipboard.writeText(compact);
    flash('Copiado para análise');
  }

  function exportJson() {
    const text = JSON.stringify(captureObject(), null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rta-network-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('JSON exportado');
  }

  function flash(message) {
    const el = root.querySelector('.rta-net-feedback');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.hidden = true, 2200);
  }

  function mount() {
    if (document.querySelector('[data-rta-network-recorder]')) return;

    root = document.createElement('div');
    root.dataset.rtaNetworkRecorder = 'true';
    root.innerHTML = `
      <button type="button" class="rta-net-fab" title="Abrir Capturador de Rede">
        <span class="material-symbols-outlined" aria-hidden="true">network_check</span>
        <span>Rede</span>
      </button>
      <section class="rta-net-panel" hidden>
        <header>
          <div><strong>Capturador de Rede</strong><small>Fetch + XMLHttpRequest</small></div>
          <button type="button" data-rta-net-close aria-label="Fechar">×</button>
        </header>
        <div class="rta-net-body">
          <label class="rta-net-name">Nome da gravação
            <input type="text" placeholder="Ex.: Enviar para Code Review">
          </label>
          <div class="rta-net-toolbar">
            <select aria-label="Filtrar método">
              <option value="ALL">Todos os métodos</option><option>GET</option><option>POST</option>
              <option>PUT</option><option>PATCH</option><option>DELETE</option>
            </select>
            <input data-rta-net-search type="search" placeholder="Filtrar URL/status">
          </div>
          <div class="rta-net-summary">
            <span class="rta-net-status">● Parado</span>
            <span><b class="rta-net-count">0</b> requisições</span>
          </div>
          <div class="rta-net-list"></div>
          <pre class="rta-net-detail" hidden></pre>
        </div>
        <div class="rta-net-feedback" hidden></div>
        <footer>
          <button type="button" data-rta-net-clear>Limpar</button>
          <button type="button" data-rta-net-copy>Copiar para IA</button>
          <button type="button" data-rta-net-export>Exportar JSON</button>
          <button type="button" class="rta-net-primary" data-rta-net-toggle>Iniciar</button>
        </footer>
      </section>`;

    document.body.append(root);
    panel = root.querySelector('.rta-net-panel');
    list = root.querySelector('.rta-net-list');
    detail = root.querySelector('.rta-net-detail');
    statusLabel = root.querySelector('.rta-net-status');
    countLabel = root.querySelector('.rta-net-count');
    toggleButton = root.querySelector('[data-rta-net-toggle]');
    nameInput = root.querySelector('.rta-net-name input');
    methodFilter = root.querySelector('select');
    textFilter = root.querySelector('[data-rta-net-search]');

    root.querySelector('.rta-net-fab').addEventListener('click', () => panel.hidden = !panel.hidden);
    root.querySelector('[data-rta-net-close]').addEventListener('click', () => panel.hidden = true);
    toggleButton.addEventListener('click', () => {
      recording = !recording;
      post(recording ? 'start' : 'stop');
      render();
    });
    root.querySelector('[data-rta-net-clear]').addEventListener('click', () => {
      entries.clear();
      detail.hidden = true;
      render();
    });
    root.querySelector('[data-rta-net-copy]').addEventListener('click', () => copyForAnalysis().catch(() => flash('Não foi possível copiar')));
    root.querySelector('[data-rta-net-export]').addEventListener('click', exportJson);
    methodFilter.addEventListener('change', render);
    textFilter.addEventListener('input', render);
    list.addEventListener('click', event => {
      const row = event.target.closest('[data-rta-net-id]');
      if (row) showDetails(row.dataset.rtaNetId);
    });

    post('state');
    render();
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== SOURCE_PAGE) return;
    if (event.data.action === 'state') recording = Boolean(event.data.recording);
    if (event.data.action === 'request') entries.set(event.data.entry.id, event.data.entry);
    if (event.data.action === 'response' && entries.has(event.data.id)) {
      Object.assign(entries.get(event.data.id), event.data.patch);
    }
    render();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();