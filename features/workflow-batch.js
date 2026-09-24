(() => {
  'use strict';
  if (window.__RTA_WORKFLOW_BATCH_1260__) return;
  window.__RTA_WORKFLOW_BATCH_1260__ = true;

  const IS_STG = location.hostname === 'stg.automation.dootax.com.br';
  const API = 'https://api.stg.automation.dootax.com.br/api';
  const FEATURE_KEY = 'rtaFeaturesV1';
  let drafts = [];
  let busy = false;
  let toolbar = null;
  let scheduled = false;
  let enabled = true;
  let lastRenderSignature = '';

  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function headerText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('svg,.material-symbols-outlined,.rta-column-resizer,.rta-column-filter-trigger,.rta-sort-indicator').forEach(x => x.remove());
    return norm(clone.textContent);
  }

  function columns(table) {
    const labels = [...(table.tHead?.rows?.[0]?.cells || [])].map(headerText);
    const find = label => labels.findIndex(x => x === label || x.startsWith(label));
    return { name: find('nome'), description: find('descricao'), status: find('status') };
  }

  function dashboardTable() {
    return [...document.querySelectorAll('table')].find(t => {
      const c = columns(t);
      return c.name >= 0 && c.description >= 0 && c.status >= 0 && t.tBodies.length;
    }) || null;
  }

  function rows() {
    const t = dashboardTable();
    return t ? [...t.querySelectorAll('tbody tr')] : [];
  }

  function cellText(row, key) {
    const t = row.closest('table');
    if (!t) return '';
    const c = columns(t);
    const i = c[key];
    return norm(i >= 0 ? row.cells[i]?.textContent : '');
  }

  function checkbox(row) {
    return row.querySelector('button[role="checkbox"],input[type="checkbox"],[role="checkbox"]');
  }

  function checked(el) {
    return !!el && (el.checked === true || el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked');
  }

  function selectedRows() {
    return rows().filter(row => checked(checkbox(row)));
  }

  function statusKind(row) {
    const s = cellText(row, 'status');
    if (s.includes('rascunho')) return 'drafting';
    if (s.includes('validacao em ambiente de desenvolvimento')) return 'tests';
    if (s.includes('aguardando revisao de codigo')) return 'review';
    return 'other';
  }

  function draftFor(row) {
    const description = cellText(row, 'description');
    const name = cellText(row, 'name');
    return drafts.find(x => description && norm(x.description) === description)
      || drafts.find(x => name && norm(x.name) === name)
      || null;
  }

  function paint() {
    for (const row of rows()) {
      row.classList.remove('rta-st-drafting','rta-st-tests','rta-st-review','rta-st-other');
      row.classList.add(`rta-st-${statusKind(row)}`);
    }
  }

  function ensureToolbar() {
    const table = dashboardTable();
    // As ações em lote alteram o workflow. Mantemos essas ações disponíveis
    // somente no STG para evitar chamadas acidentais a partir de AUT/PROD.
    if (!IS_STG || !table || !enabled) {
      toolbar?.remove();
      toolbar = null;
      return null;
    }
    const frame = table.closest('.rta-table-frame') || table.parentElement;
    if (toolbar?.isConnected && toolbar.nextElementSibling === frame) return toolbar;
    toolbar?.remove();
    toolbar = document.createElement('div');
    lastRenderSignature = '';
    toolbar.className = 'rta-workflow-batch-toolbar';
    toolbar.dataset.rtaWorkflowBatch = '1';
    toolbar.hidden = true;
    frame.before(toolbar);
    return toolbar;
  }

  function render() {
    const bar = ensureToolbar();
    if (!bar) return;
    const all = selectedRows().map(row => ({row, kind: statusKind(row), draft: draftFor(row)}));
    bar.hidden = all.length === 0;
    if (!all.length) {
      lastRenderSignature = '';
      return;
    }

    const drafting = all.filter(x => x.kind === 'drafting');
    const tests = all.filter(x => x.kind === 'tests');
    const review = all.filter(x => x.kind === 'review');
    const unresolved = all.filter(x => !x.draft).length;

    // O dashboard atualiza vários cards/contadores em segundo plano. Nas versões
    // anteriores isso recriava os botões da barra a cada MutationObserver e podia
    // remover o botão entre mousedown e click. Só renderizamos quando a seleção
    // ou os IDs/status realmente mudarem.
    const signature = JSON.stringify(all.map(x => [
      cellText(x.row, 'description'),
      x.kind,
      x.draft?.id || null
    ]));
    if (signature === lastRenderSignature && !bar.hidden) return;
    lastRenderSignature = signature;

    bar.innerHTML = `<div class="rta-wf-selection">
      <strong>${all.length} selecionado${all.length === 1 ? '' : 's'}</strong>
      <span>${drafting.length} rascunho · ${tests.length} em testes${review.length ? ` · ${review.length} em review` : ''}${unresolved ? ` · ${unresolved} aguardando ID` : ''}</span>
    </div>
    <div class="rta-wf-actions">
      ${drafting.length ? `<button type="button" class="rta-wf-btn primary" data-tests ${drafting.some(x=>!x.draft)?'disabled':''}>Enviar ${drafting.length} para Testes</button>` : ''}
      ${tests.length ? `<button type="button" class="rta-wf-btn primary" data-review ${tests.some(x=>!x.draft)?'disabled':''}>Enviar ${tests.length} para Code Review</button>` : ''}
      <button type="button" class="rta-wf-btn danger" data-reprove ${all.some(x=>!x.draft)?'disabled':''}>Reprovar ${all.length}</button>
      <button type="button" class="rta-wf-btn" data-clear>Limpar seleção</button>
    </div>`;

    bar.querySelector('[data-tests]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      advance(drafting.map(x=>x.draft), 'Enviar para Testes');
    });
    bar.querySelector('[data-review]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      advance(tests.map(x=>x.draft), 'Enviar para Code Review');
    });
    bar.querySelector('[data-reprove]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      reprove(all.map(x=>x.draft));
    });
    bar.querySelector('[data-clear]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      for (const row of selectedRows()) checkbox(row)?.click();
      schedule();
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      paint();
      render();
    });
  }

  function scheduleAfterSelection() {
    // Radix/React pode atualizar data-state/aria-checked depois do evento de clique.
    schedule();
    setTimeout(schedule, 25);
    setTimeout(schedule, 80);
    setTimeout(schedule, 180);
  }

  function xsrf() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function api(path, opt={}) {
    if (!IS_STG) throw new Error('Ações de workflow disponíveis somente em STG.');
    const headers = {Accept:'application/json, text/plain, */*', ...(opt.headers || {})};
    const token = xsrf();
    if (token) headers['X-XSRF-TOKEN'] = token;
    const response = await fetch(API + path, {credentials:'include', ...opt, headers});
    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch {}
      throw new Error(`HTTP ${response.status}${body ? ` - ${body.slice(0,120)}` : ''}`);
    }
    return response;
  }

  async function loadDrafts() {
    if (!IS_STG) {
      drafts = [];
      schedule();
      return;
    }
    try {
      const response = await api('/drafts?page=0&size=100&order=asc&orderBy=name');
      const json = await response.json();
      drafts = Array.isArray(json.content) ? json.content : [];
    } catch (e) {
      console.warn('[RTA lote] Falha ao carregar IDs:', e);
      drafts = [];
    }
    schedule();
  }

  function list(items) {
    return `<div class="rta-batch-list">${items.map(d => `<div><b>${esc(d.name)}</b><small>${esc(d.description || '')} · ${esc(d.descriptionStatus || d.status)}</small></div>`).join('')}</div>`;
  }

  function modal(title, html, label, fn, danger=false) {
    const overlay = document.createElement('div');
    overlay.className = 'rta-batch-overlay';
    overlay.innerHTML = `<div class="rta-batch-dialog"><header><h3>${esc(title)}</h3><button type="button" data-x>×</button></header><main>${html}</main><footer><button type="button" data-x>Cancelar</button><button type="button" class="${danger?'danger':'primary'}" data-ok>${esc(label)}</button></footer></div>`;
    document.body.append(overlay);
    overlay.querySelectorAll('[data-x]').forEach(x => x.onclick = () => overlay.remove());
    overlay.querySelector('[data-ok]').onclick = () => fn(overlay);
  }

  function advance(items, title) {
    if (!items.length || busy) return;
    modal(title, `<p>Confirme os robôs:</p>${list(items)}`, `${title} (${items.length})`,
      overlay => run(items, d => api(`/workflows/next-in-workflow/${d.id}`, {method:'PUT'}), overlay));
  }

  function reprove(items) {
    if (!items.length || busy) return;
    modal('Reprovar robôs',
      `<label class="rta-batch-field"><b>Justificativa</b><textarea data-j placeholder="Informe a justificativa"></textarea></label>${list(items)}`,
      `Reprovar ${items.length}`, overlay => {
        const justification = overlay.querySelector('[data-j]').value.trim();
        if (!justification) { overlay.querySelector('[data-j]').focus(); return; }
        run(items, d => api('/workflows/reprove-workflow', {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:d.id, justification})
        }), overlay);
      }, true);
  }

  function findDraftsRefreshButton() {
    const table = dashboardTable();
    if (!table) return null;
    let scope = table;
    for (let depth = 0; scope && depth < 8; depth++, scope = scope.parentElement) {
      const buttons = [...scope.querySelectorAll('button')];
      const found = buttons.find(button => {
        const icon = button.querySelector('.material-symbols-outlined');
        return clean(icon?.textContent) === 'refresh' && button.offsetParent !== null;
      });
      if (found) return found;
    }
    return null;
  }

  async function refreshDraftsList() {
    const button = findDraftsRefreshButton();
    if (button) {
      button.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadDrafts();
      schedule();
      return true;
    }
    return false;
  }

  async function run(items, fn, overlay) {
    busy = true;
    const main = overlay.querySelector('main');
    const footer = overlay.querySelector('footer');
    footer.innerHTML = '<button disabled>Processando…</button>';
    main.innerHTML = `<p>Processando <b>0 / ${items.length}</b></p><div class="rta-batch-progress"><i></i></div><div class="rta-batch-results"></div>`;
    let ok=0, fail=0;
    const results = main.querySelector('.rta-batch-results');
    for (let i=0; i<items.length; i++) {
      const d=items[i];
      const line=document.createElement('div');
      line.className='rta-batch-result';
      line.innerHTML=`<span>⟳</span><b>${esc(d.name)}</b><small>Processando…</small>`;
      results.append(line);
      try {
        await fn(d); ok++;
        line.classList.add('success'); line.querySelector('span').textContent='✓'; line.querySelector('small').textContent='Concluído';
      } catch(e) {
        fail++;
        line.classList.add('error'); line.querySelector('span').textContent='✕'; line.querySelector('small').textContent=e.message;
      }
      main.querySelector('p').innerHTML=`Processando <b>${i+1} / ${items.length}</b>`;
      main.querySelector('.rta-batch-progress i').style.width=`${(i+1)/items.length*100}%`;
    }
    busy=false;
    main.insertAdjacentHTML('afterbegin', `<div class="rta-batch-finish"><strong>${ok} concluído${ok===1?'':'s'}</strong><span>${fail} com erro</span></div>`);
    footer.innerHTML='<button class="primary" data-done>Fechar e atualizar lista</button>';
    footer.querySelector('[data-done]').onclick = async () => {
      footer.querySelector('[data-done]').disabled = true;
      const refreshed = await refreshDraftsList();
      overlay.remove();
      if (!refreshed) location.reload();
    };
  }

  async function loadFeature() {
    try {
      const stored = await chrome.storage.local.get(FEATURE_KEY);
      enabled = stored?.[FEATURE_KEY]?.workflowBatch !== false;
    } catch { enabled = true; }
    schedule();
  }

  window.addEventListener('rta-features-changed', e => {
    enabled = e.detail?.workflowBatch !== false;
    schedule();
  });

  document.addEventListener('pointerup', e => {
    if (e.target.closest('table [role="checkbox"],table input[type="checkbox"]')) scheduleAfterSelection();
  }, true);

  document.addEventListener('click', e => {
    if (e.target.closest('table [role="checkbox"],table input[type="checkbox"]')) scheduleAfterSelection();
  }, true);

  // Observa diretamente a mudança de estado dos checkboxes.
  // Não usamos debounce cancelável aqui, porque o dashboard sofre atualizações frequentes
  // e isso podia adiar indefinidamente cores/barra até trocar de aba.
  new MutationObserver(mutations => {
    if (mutations.some(m => m.type === 'attributes')) scheduleAfterSelection();
  }).observe(document.documentElement, {
    subtree:true,
    attributes:true,
    attributeFilter:['aria-checked','data-state']
  });

  // DOM novo (refresh/paginação/troca de página): aplica em um frame, sem ficar
  // reiniciando o relógio a cada mutação do dashboard.
  new MutationObserver(mutations => {
    if (mutations.some(m => m.addedNodes.length || m.removedNodes.length)) schedule();
  }).observe(document.documentElement, {subtree:true, childList:true});
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { loadFeature(); loadDrafts(); }, {once:true});
  } else {
    loadFeature(); loadDrafts();
  }
})();