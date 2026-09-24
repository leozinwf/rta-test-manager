(() => {
  'use strict';
  if (window.__RTA_WORKFLOW_BATCH_1251__) return;
  window.__RTA_WORKFLOW_BATCH_1251__ = true;

  const API = 'https://api.stg.automation.dootax.com.br/api';
  let drafts = [];
  let enabled = true;
  let actionBar = null;
  let busy = false;
  let scanTimer = null;

  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

  function xsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function api(path, options = {}) {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      ...(options.headers || {})
    };
    const token = xsrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;

    const response = await fetch(API + path, {
      credentials: 'include',
      ...options,
      headers
    });

    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch (_) {}
      throw new Error(`HTTP ${response.status}${body ? ` - ${body.slice(0, 180)}` : ''}`);
    }
    return response;
  }

  async function loadDrafts() {
    try {
      const response = await api('/drafts?page=0&size=100&order=asc&orderBy=name');
      const json = await response.json();
      drafts = Array.isArray(json.content) ? json.content : [];
      scheduleScan();
    } catch (error) {
      console.warn('[RTA Workflow Batch] Não foi possível carregar drafts:', error);
    }
  }

  function candidateTables() {
    return [...document.querySelectorAll('table')].filter(table => {
      const text = norm(table.innerText);
      return text.includes('certidão') || text.includes('rascunho') || text.includes('validação em ambiente');
    });
  }

  function tableRows() {
    const tables = candidateTables();
    return tables.flatMap(table => [...table.querySelectorAll('tbody tr')]);
  }

  function rowCheckbox(row) {
    return row.querySelector('input[type="checkbox"]');
  }

  function draftForRow(row) {
    const text = norm(row.innerText);
    if (!text) return null;

    // Prioriza a descrição curta, pois ela costuma aparecer de forma única na tabela.
    let found = drafts.find(d => d.description && text.includes(norm(d.description)));
    if (found) return found;

    found = drafts.find(d => d.name && text.includes(norm(d.name)));
    return found || null;
  }

  function selectedItems() {
    const result = [];
    const seen = new Set();

    for (const row of tableRows()) {
      const checkbox = rowCheckbox(row);
      if (!checkbox?.checked) continue;

      const draft = draftForRow(row);
      if (!draft || seen.has(draft.id)) continue;

      seen.add(draft.id);
      result.push({ draft, row, checkbox });
    }
    return result;
  }

  function applyStatusColors() {
    for (const row of tableRows()) {
      row.classList.remove('rta-st-drafting', 'rta-st-tests', 'rta-st-review', 'rta-st-other');
      const draft = draftForRow(row);
      if (!draft) continue;

      row.dataset.rtaDraftId = draft.id;
      const cls =
        draft.status === 'DRAFTING' ? 'rta-st-drafting' :
        draft.status === 'PENDING_DEV_TESTS' ? 'rta-st-tests' :
        draft.status === 'PENDING_DEV_REVIEW' ? 'rta-st-review' :
        'rta-st-other';
      row.classList.add(cls);
    }
  }

  function findToolbarAnchor() {
    const table = candidateTables()[0];
    if (!table) return null;

    // Insere imediatamente antes da tabela para ficar sempre visível junto da listagem.
    return table;
  }

  function ensureActionBar() {
    if (actionBar?.isConnected) return actionBar;
    const anchor = findToolbarAnchor();
    if (!anchor) return null;

    actionBar = document.createElement('div');
    actionBar.dataset.rtaWorkflowBatch = 'true';
    actionBar.className = 'rta-workflow-batch-toolbar';
    actionBar.hidden = true;
    anchor.parentNode.insertBefore(actionBar, anchor);
    return actionBar;
  }

  function clearNativeSelection() {
    for (const row of tableRows()) {
      const cb = rowCheckbox(row);
      if (!cb?.checked) continue;
      cb.click(); // deixa o React/Radix receber o mesmo evento que receberia do usuário
    }
    scheduleScan();
  }

  function renderActionBar() {
    const bar = ensureActionBar();
    if (!bar) return;

    const selected = selectedItems();
    bar.hidden = !enabled || selected.length === 0;
    if (bar.hidden) return;

    const draftsSelected = selected.map(x => x.draft);
    const toTests = draftsSelected.filter(d => d.status === 'DRAFTING');
    const toReview = draftsSelected.filter(d => d.status === 'PENDING_DEV_TESTS');
    const other = draftsSelected.filter(d => !['DRAFTING', 'PENDING_DEV_TESTS'].includes(d.status));

    bar.innerHTML = `
      <div class="rta-wf-selection">
        <strong>${selected.length} selecionado${selected.length === 1 ? '' : 's'}</strong>
        <span>
          ${toTests.length ? `${toTests.length} rascunho${toTests.length === 1 ? '' : 's'}` : ''}
          ${toTests.length && toReview.length ? ' · ' : ''}
          ${toReview.length ? `${toReview.length} em testes` : ''}
          ${(toTests.length || toReview.length) && other.length ? ' · ' : ''}
          ${other.length ? `${other.length} em outro estágio` : ''}
        </span>
      </div>
      <div class="rta-wf-actions">
        ${toTests.length ? `<button type="button" class="rta-wf-btn primary" data-send-tests>Enviar ${toTests.length} para Testes</button>` : ''}
        ${toReview.length ? `<button type="button" class="rta-wf-btn primary" data-send-review>Enviar ${toReview.length} para Code Review</button>` : ''}
        <button type="button" class="rta-wf-btn danger" data-reprove>Reprovar ${selected.length}</button>
        <button type="button" class="rta-wf-btn" data-clear>Limpar seleção</button>
      </div>`;

    bar.querySelector('[data-send-tests]')?.addEventListener('click', () =>
      confirmAdvance(toTests, 'Enviar para Testes', `Enviar ${toTests.length} para Testes`)
    );
    bar.querySelector('[data-send-review]')?.addEventListener('click', () =>
      confirmAdvance(toReview, 'Enviar para Code Review', `Enviar ${toReview.length} para Code Review`)
    );
    bar.querySelector('[data-reprove]')?.addEventListener('click', () => confirmReprove(draftsSelected));
    bar.querySelector('[data-clear]')?.addEventListener('click', clearNativeSelection);
  }

  function names(items) {
    return `<div class="rta-batch-list">${items.map(d =>
      `<div><b>${esc(d.name)}</b><small>${esc(d.description || '')} · ${esc(d.descriptionStatus || d.status)}</small></div>`
    ).join('')}</div>`;
  }

  function modal(title, body, confirmLabel, onConfirm, danger = false) {
    const overlay = document.createElement('div');
    overlay.className = 'rta-batch-overlay';
    overlay.innerHTML = `
      <div class="rta-batch-dialog">
        <header><h3>${esc(title)}</h3><button type="button" data-close aria-label="Fechar">×</button></header>
        <main>${body}</main>
        <footer>
          <button type="button" data-close>Cancelar</button>
          <button type="button" class="${danger ? 'danger' : 'primary'}" data-confirm>${esc(confirmLabel)}</button>
        </footer>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('[data-confirm]').addEventListener('click', () => onConfirm(overlay));
  }

  function confirmAdvance(items, title, label) {
    if (!items.length || busy) return;
    modal(
      title,
      `<p>Confirme os robôs que serão atualizados:</p>${names(items)}`,
      label,
      overlay => runBatch(
        items,
        d => api(`/workflows/next-in-workflow/${d.id}`, { method: 'PUT' }),
        overlay
      )
    );
  }

  function confirmReprove(items) {
    if (!items.length || busy) return;
    modal(
      'Reprovar robôs',
      `<label class="rta-batch-field"><b>Justificativa</b><textarea data-justification placeholder="Informe a justificativa da reprovação"></textarea></label>${names(items)}`,
      `Reprovar ${items.length}`,
      overlay => {
        const textarea = overlay.querySelector('[data-justification]');
        const justification = textarea.value.trim();
        if (!justification) {
          textarea.classList.add('invalid');
          textarea.focus();
          return;
        }
        runBatch(
          items,
          d => api('/workflows/reprove-workflow', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: d.id, justification })
          }),
          overlay
        );
      },
      true
    );
  }

  async function runBatch(items, action, overlay) {
    if (busy) return;
    busy = true;

    const main = overlay.querySelector('main');
    const footer = overlay.querySelector('footer');
    footer.innerHTML = '<button type="button" disabled>Processando…</button>';

    main.innerHTML = `
      <p class="rta-batch-counter">Processando <b>0 / ${items.length}</b></p>
      <div class="rta-batch-progress"><i></i></div>
      <div class="rta-batch-results"></div>`;

    const results = main.querySelector('.rta-batch-results');
    const progress = main.querySelector('.rta-batch-progress i');
    let ok = 0;
    const failed = [];

    for (let i = 0; i < items.length; i++) {
      const d = items[i];
      const line = document.createElement('div');
      line.className = 'rta-batch-result pending';
      line.innerHTML = `<span>⟳</span><b>${esc(d.name)}</b><small>Processando…</small>`;
      results.appendChild(line);

      try {
        await action(d);
        ok++;
        line.className = 'rta-batch-result success';
        line.querySelector('span').textContent = '✓';
        line.querySelector('small').textContent = 'Concluído';
      } catch (error) {
        failed.push({ draft: d, error: error.message });
        line.className = 'rta-batch-result error';
        line.querySelector('span').textContent = '✕';
        line.querySelector('small').textContent = error.message;
      }

      main.querySelector('.rta-batch-counter').innerHTML = `Processando <b>${i + 1} / ${items.length}</b>`;
      progress.style.width = `${((i + 1) / items.length) * 100}%`;
    }

    await loadDrafts();
    busy = false;

    const summary = document.createElement('div');
    summary.className = 'rta-batch-finish';
    summary.innerHTML = `<strong>${ok} concluído${ok === 1 ? '' : 's'}</strong><span>${failed.length} com erro</span>`;
    main.prepend(summary);

    footer.innerHTML = '<button type="button" class="primary" data-finish>Fechar e atualizar</button>';
    footer.querySelector('[data-finish]').addEventListener('click', () => location.reload());
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      applyStatusColors();
      renderActionBar();
    }, 40);
  }

  // Captura mudança de checkbox mesmo quando o framework recria os elementos.
  document.addEventListener('change', event => {
    if (event.target.matches('table input[type="checkbox"]')) scheduleScan();
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('table input[type="checkbox"]')) setTimeout(scheduleScan, 0);
  }, true);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('rta-features-changed', event => {
    enabled = event.detail?.workflowBatch !== false;
    scheduleScan();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDrafts, { once: true });
  } else {
    loadDrafts();
  }

  // Rede de segurança para atualizações do React que não disparem MutationObserver útil.
  setInterval(scheduleScan, 1200);
})();