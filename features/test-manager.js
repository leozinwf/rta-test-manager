(() => {
  'use strict';
  if (window.__RTA_TEST_MANAGER_CONTENT__) return;
  window.__RTA_TEST_MANAGER_CONTENT__ = true;

  const STORAGE_KEY = 'rtaTestManagerV1';
  const state = { scenarios: [], folders: [], selected: new Set(), activeId: null, activeFolder: 'all', filter: '', running: false, delay: 2, clipboard: null, popupBlocked: false };
  let root;
  let previewElement = null;
  let previewPinned = false;
  let previewTimer = null;

  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = (value) => (value || '').trim().toLocaleLowerCase('pt-BR');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function bridge(action, value) {
    return new Promise((resolve, reject) => {
      const id = uid();
      const timer = setTimeout(() => reject(new Error('O editor Ace não respondeu.')), 3000);
      const listener = (event) => {
        if (event.source !== window || event.data?.source !== 'rta-test-manager-page' || event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener('message', listener);
        event.data.ok ? resolve(event.data.result) : reject(new Error(event.data.error));
      };
      window.addEventListener('message', listener);
      window.postMessage({ source: 'rta-test-manager', id, action, value }, '*');
    });
  }

  const load = async () => {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const stored = data[STORAGE_KEY] || {};
    state.scenarios = Array.isArray(stored.scenarios) ? stored.scenarios : [];
    state.folders = Array.isArray(stored.folders) ? stored.folders : [];
    state.activeFolder = stored.activeFolder || 'all';
    if (!['all', 'ungrouped'].includes(state.activeFolder) && !state.folders.some(folder => folder.id === state.activeFolder)) state.activeFolder = 'all';
    state.delay = Number(stored.delay) || 2;
    state.clipboard = stored.clipboard && ['copy', 'cut'].includes(stored.clipboard.mode) ? stored.clipboard : null;
  };

  const save = () => chrome.storage.local.set({ [STORAGE_KEY]: { scenarios: state.scenarios, folders: state.folders, activeFolder: state.activeFolder, delay: state.delay, clipboard: state.clipboard } });

  function findModal() {
    const editor = document.querySelector('#UNIQUE_ID_OF_DIV.ace_editor');
    if (!editor) return null;
    const namedContainer = editor.closest('[class*="modal-container"]');
    if (namedContainer) return namedContainer;
    let current = editor;
    while (current && current !== document.body) {
      const heading = [...current.querySelectorAll('h1,h2,h3,h4')].find(h => h.textContent.trim() === 'Executar');
      if (heading) return current;
      current = current.parentElement;
    }
    return editor.parentElement;
  }

  function nativeExecuteButton(modal = findModal()) {
    return [...(modal?.querySelectorAll('button') || [])].find(button =>
      button.querySelector('span')?.textContent.trim().toLocaleLowerCase('pt-BR') === 'executar' ||
      button.textContent.trim().toLocaleLowerCase('pt-BR').endsWith('executar')
    );
  }

  async function waitForExecuteButton(modal, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const button = nativeExecuteButton(modal);
      if (button && !button.disabled) return button;
      await sleep(150);
    }
    return null;
  }

  function testOpener() {
    const modal = findModal();
    const candidates = [...document.querySelectorAll('button')].filter(button => !modal?.contains(button) && !button.closest('#rta-test-manager'));
    const byTitle = candidates.find(b => /testar/i.test(b.title || b.getAttribute('aria-label') || ''));
    if (byTitle) return byTitle;
    const byMaterialText = candidates.find(b => /^(bolt|electric_bolt|offline_bolt|flash_on)$/i.test(b.textContent.trim()));
    if (byMaterialText) return byMaterialText;
    return candidates.find(button => button.querySelector('svg path[d^="M11 21h-1l1-7H7.5"]'));
  }

  async function waitForModal(timeout = 7000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const modal = findModal();
      if (modal) return modal;
      await sleep(100);
    }
    throw new Error('Não foi possível reabrir o painel Executar.');
  }

  async function waitForModalToClose(timeout = 3000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (!findModal()) return true;
      await sleep(100);
    }
    return false;
  }

  async function openExecuteModal(timeout = 15000) {
    const existing = findModal();
    if (existing) return existing;
    const end = Date.now() + timeout;
    let opener;
    while (Date.now() < end) {
      opener = testOpener();
      if (opener && !opener.disabled) break;
      await sleep(150);
    }
    if (!opener || opener.disabled) throw new Error('Botão Testar não encontrado para continuar o lote.');
    opener.click();
    return waitForModal(10000);
  }

  async function closeExecuteModalIfOpen() {
    const modal = findModal();
    if (!modal) return;
    const heading = [...modal.querySelectorAll('h1,h2,h3,h4')].find(h => h.textContent.trim() === 'Executar');
    const header = heading?.parentElement;
    let close = [...(header?.querySelectorAll('button') || [])].find(button =>
      /^(close|×|x)$/i.test(button.textContent.trim()) || /fechar|close/i.test(button.title || button.getAttribute('aria-label') || '')
    );
    if (!close) close = [...(header?.querySelectorAll('button') || [])].at(-1);
    if (!close) close = [...modal.querySelectorAll('button')].find(button =>
      button.querySelector('svg path[d*="18 6"][d*="6 18"], svg line[x1="18"][y1="6"]')
    );
    close?.click();
    if (!await waitForModalToClose(1200)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await waitForModalToClose(1800);
    }
  }

  async function prepareModalForNextExecution() {
    const modal = findModal();
    if (!modal) return;
    const ready = await waitForExecuteButton(modal, 12000);
    if (ready) return;
    await closeExecuteModalIfOpen();
  }

  function toast(message) {
    document.querySelector('.rta-tm-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'rta-tm-toast';
    el.textContent = message;
    document.body.append(el);
    setTimeout(() => el.remove(), 2800);
  }

  function hideScenarioPreview(force = false) {
    clearTimeout(previewTimer);
    if (previewPinned && !force) return;
    previewElement?.remove();
    previewElement = null;
    previewPinned = false;
  }

  function showScenarioPreview(scenario, button, pinned = false) {
    clearTimeout(previewTimer);
    if (previewElement?.dataset.scenarioId === scenario.id && pinned && previewPinned) {
      hideScenarioPreview(true);
      return;
    }
    previewElement?.remove();
    previewPinned = pinned;
    previewElement = document.createElement('div');
    previewElement.className = `rta-tm-preview ${pinned ? 'pinned' : ''}`;
    previewElement.dataset.scenarioId = scenario.id;
    previewElement.innerHTML = `<div class="rta-tm-preview-head"><strong>${escapeHtml(scenario.title)}</strong>${pinned ? '<span>Fixado</span>' : '<span>Clique no olho para fixar</span>'}</div>${scenario.description ? `<p>${escapeHtml(scenario.description)}</p>` : ''}<pre>${escapeHtml(JSON.stringify(JSON.parse(scenario.payload), null, 2))}</pre>`;
    document.body.append(previewElement);
    const anchor = button.getBoundingClientRect();
    const box = previewElement.getBoundingClientRect();
    let left = anchor.right + 8;
    if (left + box.width > innerWidth - 12) left = anchor.left - box.width - 8;
    previewElement.style.left = `${Math.max(12, left)}px`;
    previewElement.style.top = `${Math.max(12, Math.min(anchor.top, innerHeight - box.height - 12))}px`;
  }

  function showPopupHelp() {
    if (document.querySelector('[data-rta-popup-help]')) return;
    const overlay = document.createElement('div');
    overlay.className = 'rta-tm-overlay';
    overlay.dataset.rtaPopupHelp = 'true';
    overlay.innerHTML = `<div class="rta-tm-dialog rta-tm-popup-help"><div class="rta-tm-dialog-head"><h3>Pop-up bloqueado pelo navegador</h3><button type="button" class="rta-tm-dialog-close" data-close aria-label="Fechar">×</button></div><p>Para executar vários cenários, permita que esta página abra novas abas:</p><ol><li>Clique no ícone de pop-up bloqueado no lado direito da barra de endereço.</li><li>Selecione <b>Sempre permitir pop-ups e redirecionamentos deste site</b>.</li><li>Confirme, feche esta mensagem e execute os cenários novamente.</li></ol><div class="rta-tm-dialog-actions"><button type="button" class="rta-tm-btn primary" data-close>Entendi</button></div></div>`;
    document.body.append(overlay);
    overlay.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => overlay.remove(); });
  }

  function setStatus(message) {
    document.querySelector('#rta-tm-footer-batch .rta-tm-status')?.replaceChildren(document.createTextNode(message));
  }

  function findNativeFooter(modal = findModal()) {
    const execute = nativeExecuteButton(modal);
    return execute?.parentElement || null;
  }

  function renderFooterBatch(visible) {
    const footer = findNativeFooter();
    if (!footer) return;
    let batch = footer.querySelector(':scope > #rta-tm-footer-batch');
    if (!batch) {
      batch = document.createElement('div');
      batch.id = 'rta-tm-footer-batch';
      footer.prepend(batch);
    }
    batch.innerHTML = `<input class="rta-tm-search" data-search placeholder="Buscar cenário..." value="${escapeHtml(state.filter)}"><button type="button" class="rta-tm-btn" data-import>Importar</button><button type="button" class="rta-tm-btn" data-export>Exportar</button><button type="button" class="rta-tm-btn primary" data-new>+ Novo</button><button type="button" class="rta-tm-btn" data-all>Marcar todos</button><button type="button" class="rta-tm-btn" data-none>Limpar</button><label>Intervalo <input type="number" data-delay min="1" max="60" value="${state.delay}"> s</label><button type="button" class="rta-tm-btn primary" data-run ${state.running ? 'disabled' : ''}>▶ Executar selecionados (${state.selected.size})</button><span class="rta-tm-status">${state.running ? 'Executando lote…' : 'Pronto'}</span>`;
    batch.querySelector('[data-search]').oninput = event => {
      state.filter = event.target.value;
      const cursor = state.filter.length;
      render();
      const next = document.querySelector('#rta-tm-footer-batch [data-search]');
      next?.focus();
      next?.setSelectionRange(cursor, cursor);
    };
    batch.querySelector('[data-import]').onclick = importScenarios;
    batch.querySelector('[data-export]').onclick = exportScenarios;
    batch.querySelector('[data-new]').onclick = addFromEditor;
    batch.querySelector('[data-all]').onclick = () => { visible.forEach(scenario => state.selected.add(scenario.id)); render(); };
    batch.querySelector('[data-none]').onclick = () => { state.selected.clear(); render(); };
    batch.querySelector('[data-delay]').onchange = async event => {
      state.delay = Math.max(1, Math.min(60, Number(event.target.value) || 2));
      await save();
    };
    batch.querySelector('[data-run]').onclick = runBatch;
  }

  function showScenarioDialog(existing = null, preset = null) {
    const overlay = document.createElement('div');
    overlay.className = 'rta-tm-overlay';
    const scenario = existing || { title: '', description: '', folderId: ['all', 'ungrouped'].includes(state.activeFolder) ? null : state.activeFolder, payload: preset || '{\n  \n}' };
    overlay.innerHTML = `<form class="rta-tm-dialog">
      <div class="rta-tm-dialog-head"><h3>${existing ? 'Editar cenário' : 'Novo cenário'}</h3><button type="button" class="rta-tm-dialog-close" data-close aria-label="Fechar">×</button></div>
      <label class="rta-tm-field">Título<input name="title" maxlength="80" required value="${escapeHtml(scenario.title)}" placeholder="Ex.: CNPJ com CND negativa"></label>
      <label class="rta-tm-field">Descrição<input name="description" maxlength="220" value="${escapeHtml(scenario.description)}" placeholder="Resultado esperado ou observações"></label>
      <label class="rta-tm-field">Pasta<select name="folderId"><option value="">Sem pasta</option>${state.folders.map(folder => `<option value="${folder.id}" ${scenario.folderId === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}</select></label>
      <label class="rta-tm-field">Request JSON<textarea name="payload" spellcheck="false">${escapeHtml(scenario.payload)}</textarea></label>
      <div class="rta-tm-error"></div>
      <div class="rta-tm-dialog-actions"><button type="button" class="rta-tm-btn" data-cancel>Cancelar</button><button class="rta-tm-btn primary">Salvar cenário</button></div>
    </form>`;
    document.body.append(overlay);
    overlay.querySelector('[data-cancel]').onclick = () => overlay.remove();
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const payload = form.get('payload').trim();
      try { JSON.parse(payload); } catch (error) {
        overlay.querySelector('.rta-tm-error').textContent = `JSON inválido: ${error.message}`;
        return;
      }
      const next = { id: existing?.id || uid(), title: form.get('title').trim(), description: form.get('description').trim(), folderId: form.get('folderId') || null, payload, updatedAt: new Date().toISOString() };
      if (existing) state.scenarios[state.scenarios.findIndex(s => s.id === existing.id)] = next;
      else state.scenarios.unshift(next);
      state.activeId = next.id;
      await save();
      overlay.remove();
      render();
      await applyScenario(next);
    };
  }

  function showFolderDialog(existing = null) {
    const overlay = document.createElement('div');
    overlay.className = 'rta-tm-overlay';
    overlay.innerHTML = `<form class="rta-tm-dialog" style="width:min(440px,calc(100vw - 30px))">
      <div class="rta-tm-dialog-head"><h3>${existing ? 'Renomear pasta' : 'Nova pasta'}</h3><button type="button" class="rta-tm-dialog-close" data-close aria-label="Fechar">×</button></div>
      <label class="rta-tm-field">Nome da pasta<input name="name" maxlength="60" required value="${escapeHtml(existing?.name || '')}" placeholder="Ex.: Certidões municipais"></label>
      <div class="rta-tm-error"></div>
      <div class="rta-tm-dialog-actions"><button type="button" class="rta-tm-btn" data-cancel>Cancelar</button><button class="rta-tm-btn primary">Salvar pasta</button></div>
    </form>`;
    document.body.append(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-close]').onclick = close;
    overlay.querySelector('[data-cancel]').onclick = close;
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const name = new FormData(event.currentTarget).get('name').trim();
      if (state.folders.some(folder => folder.id !== existing?.id && normalize(folder.name) === normalize(name))) {
        overlay.querySelector('.rta-tm-error').textContent = 'Já existe uma pasta com esse nome.';
        return;
      }
      if (existing) existing.name = name;
      else {
        const folder = { id: uid(), name };
        state.folders.push(folder);
        state.activeFolder = folder.id;
      }
      await save();
      close();
      render();
    };
  }

  async function removeActiveFolder() {
    const folder = state.folders.find(item => item.id === state.activeFolder);
    if (!folder || !confirm(`Excluir a pasta “${folder.name}”? Os cenários ficarão em “Sem pasta”.`)) return;
    state.scenarios.forEach(scenario => { if (scenario.folderId === folder.id) scenario.folderId = null; });
    state.folders = state.folders.filter(item => item.id !== folder.id);
    state.activeFolder = 'all';
    await save();
    render();
  }

  function actionScenarios() {
    const selected = state.scenarios.filter(scenario => state.selected.has(scenario.id));
    if (selected.length) return selected;
    const active = state.scenarios.find(scenario => scenario.id === state.activeId);
    return active ? [active] : [];
  }

  function folderOptions(selectedId = '') {
    return `<option value="ungrouped" ${selectedId === 'ungrouped' ? 'selected' : ''}>📂 Sem pasta</option>${state.folders.map(folder => `<option value="${folder.id}" ${selectedId === folder.id ? 'selected' : ''}>📁 ${escapeHtml(folder.name)}</option>`).join('')}`;
  }

  function showDestinationDialog(title, count, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'rta-tm-overlay';
    const initial = state.activeFolder === 'all' ? 'ungrouped' : state.activeFolder;
    overlay.innerHTML = `<form class="rta-tm-dialog" style="width:min(460px,calc(100vw - 30px))">
      <div class="rta-tm-dialog-head"><h3>${escapeHtml(title)}</h3><button type="button" class="rta-tm-dialog-close" data-close aria-label="Fechar">×</button></div>
      <p class="rta-tm-dialog-note">${count} cenário(s) selecionado(s).</p>
      <label class="rta-tm-field">Pasta de destino<select name="destination">${folderOptions(initial)}</select></label>
      <div class="rta-tm-dialog-actions"><button type="button" class="rta-tm-btn" data-cancel>Cancelar</button><button class="rta-tm-btn primary">Confirmar</button></div>
    </form>`;
    document.body.append(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-close]').onclick = close;
    overlay.querySelector('[data-cancel]').onclick = close;
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const destination = new FormData(event.currentTarget).get('destination');
      close();
      await onConfirm(destination === 'ungrouped' ? null : destination);
    };
  }

  async function copyScenarios() {
    const scenarios = actionScenarios();
    if (!scenarios.length) return toast('Marque ou abra um cenário para copiar.');
    state.clipboard = {
      mode: 'copy',
      items: scenarios.map(({ id, ...scenario }) => ({ ...scenario })),
      copiedAt: new Date().toISOString()
    };
    await save();
    render();
    toast(`${scenarios.length} cenário(s) copiado(s). Escolha uma pasta e use “Colar aqui”.`);
  }

  async function cutScenarios() {
    const scenarios = actionScenarios();
    if (!scenarios.length) return toast('Marque ou abra um cenário para recortar.');
    state.clipboard = {
      mode: 'cut',
      ids: scenarios.map(scenario => scenario.id),
      copiedAt: new Date().toISOString()
    };
    await save();
    render();
    toast(`${scenarios.length} cenário(s) recortado(s). Escolha a pasta de destino e cole.`);
  }

  async function pasteClipboard(folderId) {
    if (!state.clipboard) return toast('A área de transferência está vazia.');
    let changed = [];
    if (state.clipboard.mode === 'copy') {
      changed = (state.clipboard.items || []).map(item => ({
        ...item,
        id: uid(),
        title: `${item.title} (cópia)`,
        folderId,
        updatedAt: new Date().toISOString()
      }));
      state.scenarios.unshift(...changed);
    } else {
      const ids = new Set(state.clipboard.ids || []);
      changed = state.scenarios.filter(scenario => ids.has(scenario.id));
      changed.forEach(scenario => {
        scenario.folderId = folderId;
        scenario.updatedAt = new Date().toISOString();
      });
      state.clipboard = null;
    }
    if (!changed.length) {
      state.clipboard = null;
      await save();
      render();
      return toast('Os cenários da área de transferência não estão mais disponíveis.');
    }
    state.selected.clear();
    changed.forEach(scenario => state.selected.add(scenario.id));
    state.activeFolder = folderId || 'ungrouped';
    state.activeId = changed[0].id;
    await save();
    render();
    toast(`${changed.length} cenário(s) ${state.clipboard?.mode === 'copy' ? 'copiado(s)' : 'movido(s)'} para a pasta.`);
  }

  function pasteScenarios() {
    if (!state.clipboard) return toast('A área de transferência está vazia.');
    const count = state.clipboard.mode === 'copy' ? (state.clipboard.items || []).length : (state.clipboard.ids || []).length;
    if (state.activeFolder === 'all') return showDestinationDialog('Colar cenários', count, pasteClipboard);
    return pasteClipboard(state.activeFolder === 'ungrouped' ? null : state.activeFolder);
  }

  function moveScenarios() {
    const scenarios = actionScenarios();
    if (!scenarios.length) return toast('Marque ou abra um cenário para mover.');
    showDestinationDialog('Mover cenários', scenarios.length, async folderId => {
      scenarios.forEach(scenario => {
        scenario.folderId = folderId;
        scenario.updatedAt = new Date().toISOString();
      });
      state.selected.clear();
      scenarios.forEach(scenario => state.selected.add(scenario.id));
      state.activeFolder = folderId || 'ungrouped';
      state.activeId = scenarios[0].id;
      await save();
      render();
      toast(`${scenarios.length} cenário(s) movido(s).`);
    });
  }

  async function applyScenario(scenario) {
    state.activeId = scenario.id;
    await bridge('set', JSON.stringify(JSON.parse(scenario.payload), null, 2));
    render();
    toast(`Request carregada: ${scenario.title}`);
  }

  async function addFromEditor() {
    try { showScenarioDialog(null, await bridge('get')); }
    catch (error) { toast(error.message); }
  }

  async function duplicateScenario(scenario) {
    const copy = { ...scenario, id: uid(), title: `${scenario.title} (cópia)`, updatedAt: new Date().toISOString() };
    state.scenarios.unshift(copy);
    await save(); render();
  }

  async function removeScenario(scenario) {
    if (!confirm(`Remover o cenário “${scenario.title}”?`)) return;
    state.scenarios = state.scenarios.filter(s => s.id !== scenario.id);
    state.selected.delete(scenario.id);
    if (state.activeId === scenario.id) state.activeId = null;
    await save(); render();
  }

  function quickVariants(base) {
    if (!base) return toast('Selecione um cenário base primeiro.');
    const overlay = document.createElement('div');
    overlay.className = 'rta-tm-overlay';
    overlay.innerHTML = `<form class="rta-tm-dialog">
      <div class="rta-tm-dialog-head"><h3>Gerar variações rápidas</h3><button type="button" class="rta-tm-dialog-close" data-close aria-label="Fechar">×</button></div>
      <label class="rta-tm-field">Campo do JSON<input name="field" required value="cnpj" placeholder="cnpj ou im"></label>
      <label class="rta-tm-field">Valores, um por linha<textarea name="values" required placeholder="Cliente A | 42446277002306\nCliente B | 23048790000180"></textarea></label>
      <div style="font-size:12px;color:#5c6864;margin:-5px 0 10px">Use <b>Título | valor</b> ou informe somente o valor. A request base será copiada.</div>
      <div class="rta-tm-error"></div><div class="rta-tm-dialog-actions"><button type="button" class="rta-tm-btn" data-cancel>Cancelar</button><button class="rta-tm-btn primary">Gerar cenários</button></div>
    </form>`;
    document.body.append(overlay);
    overlay.querySelector('[data-cancel]').onclick = () => overlay.remove();
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const field = data.get('field').trim();
      const lines = data.get('values').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
      if (!lines.length) return;
      const created = [];
      try {
        for (const line of lines) {
          const parts = line.split('|');
          const value = (parts.length > 1 ? parts.pop() : parts[0]).trim();
          const label = parts.length ? parts.join('|').trim() : value;
          const json = JSON.parse(base.payload);
          json[field] = value;
          created.push({ id: uid(), title: `${base.title} — ${label}`, description: `Variação de ${base.title}: ${field} = ${value}`, folderId: base.folderId || null, payload: JSON.stringify(json, null, 2), updatedAt: new Date().toISOString() });
        }
      } catch (error) {
        overlay.querySelector('.rta-tm-error').textContent = error.message; return;
      }
      state.scenarios.unshift(...created);
      created.forEach(s => state.selected.add(s.id));
      await save(); overlay.remove(); render();
      toast(`${created.length} variação(ões) criada(s) e selecionada(s).`);
    };
  }

  async function runBatch() {
    const queue = state.scenarios.filter(s => state.selected.has(s.id));
    if (!queue.length) return toast('Selecione pelo menos um cenário.');
    if (state.running) return;
    state.popupBlocked = false;
    state.running = true; render();
    try {
      for (let i = 0; i < queue.length; i++) {
        const scenario = queue[i];
        setStatus(`${i + 1}/${queue.length}: preparando ${scenario.title}`);
        const modal = await openExecuteModal();
        await bridge('set', JSON.stringify(JSON.parse(scenario.payload), null, 2));
        await sleep(180);
        const button = await waitForExecuteButton(modal);
        if (!button) throw new Error(`Botão Executar indisponível em “${scenario.title}”.`);
        setStatus(`${i + 1}/${queue.length}: executando ${scenario.title}`);
        button.click();
        await sleep(350);
        if (state.popupBlocked) throw new Error('Pop-up bloqueado. Libere os pop-ups do site e tente novamente.');
        if (i < queue.length - 1) {
          setStatus(`${i + 1}/${queue.length}: aguardando próximo disparo`);
          await sleep(state.delay * 1000);
          await prepareModalForNextExecution();
        }
      }
      toast(`Lote enviado: ${queue.length} cenário(s).`);
      setStatus(`Concluído: ${queue.length} cenário(s) enviado(s).`);
    } catch (error) {
      toast(`Lote interrompido: ${error.message}`);
      setStatus(`Erro: ${error.message}`);
    } finally {
      state.running = false; render();
    }
  }

  function exportScenarios() {
    const blob = new Blob([JSON.stringify({ version: 2, folders: state.folders, scenarios: state.scenarios }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `rta-testes-${new Date().toISOString().slice(0,10)}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importScenarios() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      try {
        const parsed = JSON.parse(await input.files[0].text());
        if (!Array.isArray(parsed.scenarios)) throw new Error('Arquivo sem uma lista de cenários.');
        const folderMap = new Map();
        const incomingFolders = (Array.isArray(parsed.folders) ? parsed.folders : []).map(folder => {
          const next = { id: uid(), name: String(folder.name || 'Pasta importada') };
          folderMap.set(folder.id, next.id);
          return next;
        });
        const incoming = parsed.scenarios.map(s => ({ id: uid(), title: String(s.title || 'Sem título'), description: String(s.description || ''), folderId: folderMap.get(s.folderId) || null, payload: JSON.stringify(JSON.parse(s.payload), null, 2), updatedAt: new Date().toISOString() }));
        state.folders.push(...incomingFolders);
        state.scenarios.unshift(...incoming); await save(); render(); toast(`${incoming.length} cenário(s) e ${incomingFolders.length} pasta(s) importado(s).`);
      } catch (error) { toast(`Falha ao importar: ${error.message}`); }
    };
    input.click();
  }

  function render() {
    if (!root) return;
    const filter = normalize(state.filter);
    const inActiveFolder = scenario => state.activeFolder === 'all' || (state.activeFolder === 'ungrouped' ? !scenario.folderId : scenario.folderId === state.activeFolder);
    const visible = state.scenarios.filter(s => inActiveFolder(s) && normalize(`${s.title} ${s.description} ${s.payload}`).includes(filter));
    const active = state.scenarios.find(s => s.id === state.activeId);
    const activeFolder = state.folders.find(folder => folder.id === state.activeFolder);
    const countIn = folderId => state.scenarios.filter(s => folderId === 'all' ? true : folderId === 'ungrouped' ? !s.folderId : s.folderId === folderId).length;
    root.innerHTML = `<section class="rta-tm-panel">
      <div class="rta-tm-head"><strong>🧪 Cenários</strong><span class="rta-tm-head-count">${visible.length} visível(is)</span></div>
      <div class="rta-tm-folderbar"><select data-folder-filter aria-label="Pasta"><option value="all" ${state.activeFolder === 'all' ? 'selected' : ''}>📁 Todos (${countIn('all')})</option><option value="ungrouped" ${state.activeFolder === 'ungrouped' ? 'selected' : ''}>📂 Sem pasta (${countIn('ungrouped')})</option>${state.folders.map(folder => `<option value="${folder.id}" ${state.activeFolder === folder.id ? 'selected' : ''}>📁 ${escapeHtml(folder.name)} (${countIn(folder.id)})</option>`).join('')}</select><select data-folder-actions aria-label="Ações de pasta"><option value="">Ações…${state.clipboard ? ' 📋' : ''}</option><option value="copy">Copiar</option><option value="cut">Recortar</option><option value="paste" ${state.clipboard ? '' : 'disabled'}>Colar aqui${state.clipboard ? ` (${state.clipboard.mode === 'copy' ? (state.clipboard.items || []).length : (state.clipboard.ids || []).length})` : ''}</option><option value="move">Mover para…</option></select><button type="button" class="rta-tm-btn" data-new-folder title="Nova pasta">＋📁</button><button type="button" class="rta-tm-btn" data-rename-folder title="Renomear pasta" ${activeFolder ? '' : 'disabled'}>✎</button><button type="button" class="rta-tm-btn danger" data-delete-folder title="Excluir pasta" ${activeFolder ? '' : 'disabled'}>×</button></div>
      <div class="rta-tm-body"><div class="rta-tm-list">${visible.length ? visible.map(s => `<article class="rta-tm-card ${s.id === state.activeId ? 'active' : ''}" data-id="${s.id}"><input type="checkbox" data-select ${state.selected.has(s.id) ? 'checked' : ''} aria-label="Selecionar ${escapeHtml(s.title)}"><div><div class="rta-tm-card-title">${escapeHtml(s.title)}</div><span class="rta-tm-card-desc">${escapeHtml(s.description || 'Sem descrição')}</span></div><div class="rta-tm-card-buttons"><button type="button" class="rta-tm-mini preview" data-preview title="Visualizar request"><span class="material-symbols-outlined">visibility</span></button><button type="button" class="rta-tm-mini add" data-load title="Carregar no editor">+</button><button type="button" class="rta-tm-mini" data-edit-row title="Editar cenário">✎</button></div></article>`).join('') : '<div class="rta-tm-empty">Nenhum cenário salvo.<br>Use “+ Novo” para começar.</div>'}</div>
      ${active ? `<aside class="rta-tm-detail"><div class="rta-tm-detail-head"><h4>${escapeHtml(active.title)}</h4><button type="button" class="rta-tm-detail-close" data-close-detail title="Fechar detalhes" aria-label="Fechar detalhes">×</button></div><p>${escapeHtml(active.description || 'Sem descrição')}</p><div class="rta-tm-actions"><button type="button" class="rta-tm-btn" data-copy>Duplicar</button><button type="button" class="rta-tm-btn" data-variants>Variações</button><button type="button" class="rta-tm-btn danger" data-delete>Remover</button></div></aside>` : ''}</div>
    </section>`;

    renderFooterBatch(visible);

    root.querySelector('[data-new-folder]').onclick = () => showFolderDialog();
    root.querySelector('[data-rename-folder]').onclick = () => { if (activeFolder) showFolderDialog(activeFolder); };
    root.querySelector('[data-delete-folder]').onclick = removeActiveFolder;
    root.querySelector('[data-folder-actions]').onchange = async event => {
      const action = event.target.value;
      event.target.value = '';
      if (action === 'copy') await copyScenarios();
      if (action === 'cut') await cutScenarios();
      if (action === 'paste') await pasteScenarios();
      if (action === 'move') moveScenarios();
    };
    root.querySelector('[data-folder-filter]').onchange = async event => {
      state.activeFolder = event.target.value;
      state.activeId = null;
      await save();
      render();
    };
    root.querySelectorAll('.rta-tm-card').forEach(card => {
      const scenario = state.scenarios.find(s => s.id === card.dataset.id);
      const previewButton = card.querySelector('[data-preview]');
      previewButton.onmouseenter = () => showScenarioPreview(scenario, previewButton, false);
      previewButton.onmouseleave = () => { previewTimer = setTimeout(() => hideScenarioPreview(), 160); };
      previewButton.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        showScenarioPreview(scenario, previewButton, true);
      };
      card.onclick = e => {
        const action = e.target.closest('button');
        if (action?.matches('[data-preview]')) return;
        if (e.target.matches('[data-select]')) { e.stopPropagation(); e.target.checked ? state.selected.add(scenario.id) : state.selected.delete(scenario.id); render(); return; }
        if (action?.matches('[data-load]')) { e.stopPropagation(); applyScenario(scenario).catch(error => toast(error.message)); return; }
        if (action?.matches('[data-edit-row]')) { e.stopPropagation(); showScenarioDialog(scenario); return; }
        state.activeId = scenario.id;
        render();
      };
    });
    if (active) {
      root.querySelector('[data-close-detail]').onclick = () => { state.activeId = null; render(); };
      root.querySelector('[data-copy]').onclick = () => duplicateScenario(active);
      root.querySelector('[data-variants]').onclick = () => quickVariants(active);
      root.querySelector('[data-delete]').onclick = () => removeScenario(active);
    }
  }

  async function mount() {
    const editor = document.querySelector('#UNIQUE_ID_OF_DIV.ace_editor');
    if (!editor) return;
    const existing = document.querySelector('#rta-test-manager');
    if (existing) {
      root = existing;
      if (!document.querySelector('#rta-tm-footer-batch')) render();
      return;
    }
    const modal = findModal();
    if (!modal) return;
    modal.style.width = 'min(1400px, calc(100vw - 24px))';
    modal.style.maxWidth = '1400px';
    modal.style.maxHeight = 'calc(100vh - 24px)';
    modal.style.overflow = 'auto';
    root = document.createElement('div');
    root.id = 'rta-test-manager';
    editor.parentElement.classList.add('rta-tm-host');
    editor.parentElement.insertBefore(root, editor);
    await load();
    render();
    bridge('get').catch(() => {});
  }

  const observer = new MutationObserver(() => mount().catch(console.error));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'rta-popup-monitor' || !event.data.blocked) return;
    state.popupBlocked = true;
    showPopupHelp();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideScenarioPreview(true); });
  document.addEventListener('pointerdown', event => {
    if (previewPinned && !previewElement?.contains(event.target) && !event.target.closest?.('[data-preview]')) hideScenarioPreview(true);
  });
  mount().catch(console.error);
})();
