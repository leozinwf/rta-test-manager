(() => {
  if (window.__RTA_TEST_MANAGER_BRIDGE__) return;
  window.__RTA_TEST_MANAGER_BRIDGE__ = true;

  let capturedOpenRequest = null;
  let captureTimer = null;
  let restoreHistoryCapture = null;
  const originalOpen = window.open;

  function stopCapture() {
    capturedOpenRequest = null;
    clearTimeout(captureTimer);
    captureTimer = null;
    restoreHistoryCapture?.();
    restoreHistoryCapture = null;
  }

  function startCapture(token) {
    stopCapture();
    capturedOpenRequest = token;
    const previousPushState = history.pushState;
    const previousReplaceState = history.replaceState;
    const capturedPushState = function() {
      if (capturedOpenRequest && arguments[2] != null) {
        deliverCapturedOpen(arguments[2]);
        return;
      }
      return previousPushState.apply(this, arguments);
    };
    const capturedReplaceState = function() {
      if (capturedOpenRequest && arguments[2] != null) {
        deliverCapturedOpen(arguments[2]);
        return;
      }
      return previousReplaceState.apply(this, arguments);
    };
    history.pushState = capturedPushState;
    history.replaceState = capturedReplaceState;
    restoreHistoryCapture = () => {
      if (history.pushState === capturedPushState) history.pushState = previousPushState;
      if (history.replaceState === capturedReplaceState) history.replaceState = previousReplaceState;
    };
    captureTimer = setTimeout(stopCapture, 3000);
  }

  function deliverCapturedOpen(value) {
    if (!capturedOpenRequest) return;
    let resolved = '';
    try {
      const url = new URL(String(value || ''), location.href);
      if (/^https?:$/.test(url.protocol)) resolved = url.href;
    } catch (_) {}
    if (!resolved) return;
    const token = capturedOpenRequest;
    stopCapture();
    window.postMessage({ source: 'rta-table-enhancer-page', token, value: resolved }, '*');
  }
  window.open = function() {
    if (capturedOpenRequest) {
      deliverCapturedOpen(arguments[0]);
      const locationProxy = {
        assign: deliverCapturedOpen,
        replace: deliverCapturedOpen,
        set href(value) { deliverCapturedOpen(value); }
      };
      return { location: locationProxy, close() {}, focus() {}, closed: false };
    }
    const opened = originalOpen.apply(this, arguments);
    if (opened === null) window.postMessage({ source: 'rta-popup-monitor', blocked: true }, '*');
    return opened;
  };

  function findFullReactText(element, prefix) {
    const candidates = [];
    const seen = new WeakSet();
    let inspected = 0;
    const inspect = (value, depth = 0) => {
      if (inspected++ > 20000 || depth > 9 || value == null) return;
      if (typeof value === 'string') {
        const clean = value.trim();
        if (clean.length > prefix.length && clean.length < 10000 && clean.startsWith(prefix) && !clean.endsWith('...')) candidates.push(clean);
        return;
      }
      if (typeof value !== 'object' || value instanceof Node || seen.has(value)) return;
      seen.add(value);
      for (const key of Object.keys(value)) {
        if (key === '_owner' || key === 'return' || key === 'stateNode') continue;
        inspect(value[key], depth + 1);
      }
    };
    let dom = element;
    for (let domDepth = 0; dom && domDepth < 7 && !candidates.length; domDepth++, dom = dom.parentElement) {
      for (const key of Object.keys(dom)) {
        if (key.startsWith('__reactProps$')) inspect(dom[key]);
        if (!key.startsWith('__reactFiber$') && !key.startsWith('__reactInternalInstance$')) continue;
        let fiber = dom[key];
        for (let fiberDepth = 0; fiber && fiberDepth < 20; fiberDepth++, fiber = fiber.return) {
          inspect(fiber.memoizedProps);
          inspect(fiber.pendingProps);
          inspect(fiber.memoizedState);
          if (candidates.length) break;
        }
      }
    }
    return candidates.sort((a, b) => a.length - b.length)[0] || null;
  }

  function findReactRequestUrl(element) {
    const candidates = [];
    const seen = new WeakSet();
    let inspected = 0;
    const inspect = (value, path = '', depth = 0) => {
      if (inspected++ > 30000 || depth > 10 || value == null) return;
      if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
        const normalizedPath = path.toLowerCase();
        let score = 0;
        if (/request.?url|url.?request|requisicao.?url/.test(normalizedPath)) score += 100;
        if (/(url|endpoint|request)/.test(normalizedPath)) score += 40;
        if (/(avatar|logo|icon|image|asset)/.test(normalizedPath)) score -= 100;
        candidates.push({ value: value.trim(), score });
        return;
      }
      if (typeof value !== 'object' || value instanceof Node || seen.has(value)) return;
      seen.add(value);
      for (const key of Object.keys(value)) {
        if (key === '_owner' || key === 'return' || key === 'stateNode') continue;
        inspect(value[key], path ? `${path}.${key}` : key, depth + 1);
      }
    };
    for (const key of Object.keys(element || {})) {
      if (key.startsWith('__reactProps$')) inspect(element[key]);
      if (!key.startsWith('__reactFiber$') && !key.startsWith('__reactInternalInstance$')) continue;
      let fiber = element[key];
      for (let depth = 0; fiber && depth < 14; depth++, fiber = fiber.return) {
        inspect(fiber.memoizedProps);
        inspect(fiber.pendingProps);
        inspect(fiber.memoizedState);
      }
    }
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    return best?.score >= 40 ? best.value : '';
  }

  let activeTruncatedElement = null;

  function applyFullText(element, full) {
    if (!element || !full) return false;
    const shown = element.textContent.trim();
    const prefix = shown.endsWith('...') ? shown.slice(0, -3) : shown;
    if (full.length <= prefix.length || !full.startsWith(prefix)) return false;
    element.textContent = full;
    element.title = full;
    element.dataset.rtaFullText = 'true';
    return true;
  }

  function captureOpenTooltip() {
    if (!activeTruncatedElement?.isConnected || !activeTruncatedElement.textContent.trim().endsWith('...')) return;
    const describedBy = activeTruncatedElement.getAttribute('aria-describedby');
    const tooltip = (describedBy && document.getElementById(describedBy)) ||
      [...document.querySelectorAll('[role="tooltip"]')].find(item => item.textContent.trim());
    if (tooltip) applyFullText(activeTruncatedElement, tooltip.textContent.trim());
  }

  async function resolveElementFullText(element) {
    if (!element) return '';
    const shown = element.textContent.trim();
    if (!shown.endsWith('...')) return shown;
    const prefix = shown.slice(0, -3);
    const reactText = findFullReactText(element, prefix);
    if (reactText) {
      applyFullText(element, reactText);
      return reactText;
    }
    activeTruncatedElement = element;
    element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 850));
    captureOpenTooltip();
    element.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
    element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    return element.textContent.trim();
  }

  document.addEventListener('pointerover', event => {
    const element = event.target.closest?.('.rta-resizable-table span.truncate');
    if (element?.textContent.trim().endsWith('...')) activeTruncatedElement = element;
  }, true);
  document.addEventListener('focusin', event => {
    const element = event.target.closest?.('.rta-resizable-table span.truncate');
    if (element?.textContent.trim().endsWith('...')) activeTruncatedElement = element;
  }, true);
  const tooltipObserver = new MutationObserver(captureOpenTooltip);
  const observeTooltips = () => {
    if (!document.documentElement) return requestAnimationFrame(observeTooltips);
    tooltipObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-describedby'] });
  };
  observeTooltips();

  async function hydrateColumn(tableKey, columnIndex) {
    const table = [...document.querySelectorAll('.rta-resizable-table')].find(item => item.dataset.rtaTableKey === tableKey);
    if (!table) return;
    const elements = [...table.tBodies].flatMap(body => [...body.rows])
      .map(row => row.cells[columnIndex]?.querySelector('span.truncate'))
      .filter(element => element?.textContent.trim().endsWith('...'));
    for (const element of elements) await resolveElementFullText(element);
  }

  function restoreTruncatedTableText() {
    document.querySelectorAll('.rta-resizable-table span.truncate').forEach(element => {
      const shown = element.textContent.trim();
      if (!shown.endsWith('...')) return;
      const prefix = shown.slice(0, -3);
      const full = findFullReactText(element, prefix);
      if (!full) return;
      applyFullText(element, full);
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'rta-table-enhancer') return;
    if (event.data.action === 'restore-text') restoreTruncatedTableText();
    if (event.data.action === 'hydrate-column') hydrateColumn(event.data.tableKey, Number(event.data.columnIndex));
    if (event.data.action === 'resolve-cell-text') {
      const token = String(event.data.token || '');
      const element = [...document.querySelectorAll('[data-rta-cell-token]')].find(item => item.dataset.rtaCellToken === token);
      resolveElementFullText(element).then(value => {
        window.postMessage({ source: 'rta-table-enhancer-page', token, value }, '*');
      });
    }
    if (event.data.action === 'resolve-execution-url') {
      const token = String(event.data.token || '');
      const row = [...document.querySelectorAll('[data-rta-execution-token]')].find(item => item.dataset.rtaExecutionToken === token);
      window.postMessage({ source: 'rta-table-enhancer-page', token, value: findReactRequestUrl(row) }, '*');
    }
    if (event.data.action === 'capture-next-open') {
      const token = String(event.data.token || '');
      if (token) startCapture(token);
    }
  });

  const findEditor = () => {
    const element = document.querySelector('#UNIQUE_ID_OF_DIV.ace_editor, .ace_editor#UNIQUE_ID_OF_DIV');
    if (!element) throw new Error('Editor Ace do painel Executar não encontrado.');
    const editor = element.env?.editor || window.ace?.edit?.(element);
    if (!editor) throw new Error('Instância do editor Ace não encontrada.');
    if (!element.__rtaResizeObserver) {
      element.__rtaResizeObserver = new ResizeObserver(() => editor.resize?.());
      element.__rtaResizeObserver.observe(element);
    }
    return editor;
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'rta-test-manager') return;
    const { id, action, value } = event.data;
    try {
      const editor = findEditor();
      let result;
      if (action === 'get') result = editor.getValue();
      if (action === 'set') {
        editor.setValue(value, -1);
        editor.clearSelection();
        editor.focus();
        result = editor.getValue();
      }
      window.postMessage({ source: 'rta-test-manager-page', id, ok: true, result }, '*');
    } catch (error) {
      window.postMessage({ source: 'rta-test-manager-page', id, ok: false, error: error.message }, '*');
    }
  });
})();
