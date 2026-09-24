(() => {
  'use strict';
  if (window.__RTA_PAGE_SIZE_CONTENT__) return;
  window.__RTA_PAGE_SIZE_CONTENT__ = true;

  const DEFAULT_SIZES = [5, 10, 15, 25];
  const EXTRA_SIZES = [50, 100];
  const STORAGE_KEY = 'rtaPageSizeByPageV1';
  let savedPageSizes = {};
  let storageLoaded = false;
  let mountQueued = false;
  let bridgeSequence = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const restoreTimers = new WeakMap();
  const text = element => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const pageKey = () => `${location.origin}${location.pathname}`;

  function configureBridge(action, size) {
    const token = `rta-page-size-${Date.now()}-${++bridgeSequence}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new Error('A integração de paginação não respondeu.'));
      }, 1500);
      const listener = event => {
        if (event.source !== window || event.data?.source !== 'rta-page-size-page' || event.data.token !== token) return;
        clearTimeout(timeout);
        window.removeEventListener('message', listener);
        resolve();
      };
      window.addEventListener('message', listener);
      window.postMessage({ source: 'rta-page-size', action, size, token }, '*');
    });
  }

  function waitForBridgeEvent(action, size, timeoutMs = 3000) {
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', listener);
        resolve(false);
      }, timeoutMs);
      const listener = event => {
        if (event.source !== window || event.data?.source !== 'rta-page-size-page' || event.data.action !== action) return;
        if (size != null && Number(event.data.size) !== Number(size)) return;
        clearTimeout(timeout);
        window.removeEventListener('message', listener);
        resolve(true);
      };
      window.addEventListener('message', listener);
    });
  }

  async function loadStorage() {
    if (storageLoaded) return;
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    savedPageSizes = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === 'object' ? stored[STORAGE_KEY] : {};
    storageLoaded = true;
  }

  async function savePageSize(value) {
    savedPageSizes[pageKey()] = value;
    await chrome.storage.local.set({ [STORAGE_KEY]: savedPageSizes });
  }

  function findNativeButtons() {
    return [...document.querySelectorAll('button[role="combobox"]')].filter(button =>
      /^\d+\s*\/\s*página$/i.test(text(button.querySelector('span') || button)) &&
      !button.dataset.rtaPageSize
    );
  }

  function totalFromPage(button) {
    const scope = button.closest('[class*="items-center"]')?.parentElement || button.parentElement?.parentElement;
    const candidates = [...(scope?.querySelectorAll('div,span') || [])].map(text);
    for (const value of candidates) {
      const match = value.match(/(?:\d+\s*[-–]\s*\d+\s+)?de\s+([\d.]+)/i);
      if (match) return Number(match[1].replace(/\D/g, '')) || null;
    }
    return null;
  }

  async function chooseNative(button, size) {
    button.click();
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const options = [...document.querySelectorAll('[role="option"]')];
      const option = options.find(item => new RegExp(`^${size}(?:\\s*\\/\\s*página)?$`, 'i').test(text(item)));
      if (option) {
        option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
        option.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
        option.click();
        return true;
      }
      await sleep(50);
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }

  function visibleRowsNear(button) {
    const table = [...document.querySelectorAll('table')].find(table => {
      const rect = table.getBoundingClientRect();
      const br = button.getBoundingClientRect();
      return Math.abs(rect.bottom - br.top) < 500 || Math.abs(rect.top - br.bottom) < 1000;
    });
    return table ? [...table.querySelectorAll('tbody tr')].filter(row => row.offsetParent !== null).length : null;
  }

  function expectedEnoughRows(button, value) {
    const total = totalFromPage(button);
    const rows = visibleRowsNear(button);
    if (!total || rows == null) return true;
    const desired = value === 'all' ? total : Math.min(Number(value) || total, total);
    return rows >= desired;
  }

  async function ensureSavedSize(button, select, value, attempts = 2) {
    if (!button.isConnected || !select.isConnected) return;
    if (select.dataset.restoring === 'true') return;
    select.dataset.restoring = 'true';
    try {
      for (let attempt = 0; attempt < attempts; attempt++) {
        await applySize(button, select, value);
        await sleep(550);
        if (expectedEnoughRows(button, value)) break;
        console.warn('[RTA paginação] quantidade carregada abaixo do esperado; tentando reaplicar', value);
      }
    } finally {
      delete select.dataset.restoring;
    }
  }

  async function applySize(button, select, value) {
    select.disabled = true;
    const previousValue = select.dataset.activeSize || '';
    await savePageSize(value);
    try {
      const all = value === 'all';
      const desired = all ? (totalFromPage(button) || 10000) : Number(value);
      const isExtra = all || EXTRA_SIZES.includes(desired);
      const previousWasExtra = previousValue === 'all' || EXTRA_SIZES.includes(Number(previousValue));
      await configureBridge(isExtra ? 'learn' : 'clear');

      const current = Number(text(button).match(/^\d+/)?.[0]);
      let trigger = desired;
      if (isExtra) trigger = current === 15 ? 10 : 15;
      if (!isExtra && previousWasExtra && current === desired) trigger = desired === 25 ? 15 : 25;
      const learned = isExtra ? waitForBridgeEvent('learned') : null;
      const changed = await chooseNative(button, trigger);
      if (!changed) throw new Error('Opção nativa de paginação não encontrada.');

      if (isExtra) {
        if (!await learned) throw new Error('A requisição de paginação não foi identificada.');
        await configureBridge('apply', desired);
        const rewritten = waitForBridgeEvent('rewritten', desired);
        if (!await chooseNative(button, 25)) throw new Error('Não foi possível aplicar a paginação ampliada.');
        if (!await rewritten) throw new Error('A paginação ampliada não foi aplicada.');
        await sleep(250);
      } else if (trigger !== desired) {
        await sleep(250);
        if (!await chooseNative(button, desired)) throw new Error('Não foi possível restaurar a paginação nativa.');
      }
      select.value = value;
      select.title = all ? `Todos os itens (${desired})` : `${desired} itens por página`;
      select.dataset.activeSize = value;
    } catch (error) {
      console.warn('[RTA paginação]', error);
      configureBridge('clear').catch(() => {});
      select.value = select.dataset.activeSize || String(Number(text(button).match(/^\d+/)?.[0]) || 5);
      if (previousValue) await savePageSize(previousValue);
    } finally {
      select.disabled = false;
    }
  }

  function enhance(button) {
    button.dataset.rtaPageSize = 'native';
    button.classList.add('rta-page-size-native-hidden');
    const current = Number(text(button).match(/^\d+/)?.[0]) || 5;
    const select = document.createElement('select');
    select.className = 'rta-page-size-select';
    select.setAttribute('aria-label', 'Itens por página');
    select.dataset.activeSize = String(current);
    select.innerHTML = [...DEFAULT_SIZES, ...EXTRA_SIZES]
      .map(size => `<option value="${size}" ${size === current ? 'selected' : ''}>${size} / página</option>`)
      .join('') + '<option value="all">Todos</option>';
    select.addEventListener('change', () => applySize(button, select, select.value));
    button.insertAdjacentElement('afterend', select);
    const saved = savedPageSizes[pageKey()];
    if (saved) {
      select.value = saved;
      select.dataset.activeSize = String(current);
      const previousTimer = restoreTimers.get(button);
      if (previousTimer) clearTimeout(previousTimer);
      const timer = setTimeout(() => {
        ensureSavedSize(button, select, saved).catch(error => console.warn('[RTA paginação]', error));
      }, 700);
      restoreTimers.set(button, timer);
    }
  }

  async function mount() {
    mountQueued = false;
    await loadStorage();
    findNativeButtons().forEach(enhance);
    document.querySelectorAll('.rta-page-size-select').forEach(select => {
      const button = select.previousElementSibling;
      if (!select.isConnected || button?.dataset.rtaPageSize !== 'native') {
        select.remove();
        return;
      }
      const saved = savedPageSizes[pageKey()];
      if (saved && select.dataset.restoring !== 'true' && !expectedEnoughRows(button, saved)) {
        const previousTimer = restoreTimers.get(button);
        if (previousTimer) clearTimeout(previousTimer);
        const timer = setTimeout(() => {
          ensureSavedSize(button, select, saved, 1).catch(error => console.warn('[RTA paginação]', error));
        }, 450);
        restoreTimers.set(button, timer);
      }
    });
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(() => mount().catch(error => console.warn('[RTA paginação]', error)));
  }

  const observer = new MutationObserver(queueMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  queueMount();
})();
