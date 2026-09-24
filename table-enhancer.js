(() => {
  'use strict';
  if (window.__RTA_TABLE_ENHANCER__) return;
  window.__RTA_TABLE_ENHANCER__ = true;

  const STORAGE_KEY = 'rtaResizableTableWidthsV3';
  const FILTER_STORAGE_KEY = 'rtaTableFiltersV1';
  const EDIT_HASH_PREFIX = '#rta-edit=';
  const MIN_WIDTH = 40;
  const NATIVE_FILTER_BUTTON_CLASSES = 'text-sm ring-offset-background items-center whitespace-nowrap ring-offset-0 transition-colors focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-[#FFF] border-[#A5AFA5] hover:bg-[#FFF] hover:border-[#00A478] active:bg-[#00A4784D] active:border-[#00A4784D] text-[black] h-[2.5rem] py-[0.3125rem] px-[0.5rem] uppercase relative inline-flex justify-center align-center gap-[0.3125rem] shrink-[0] text-center !text-[1rem] font-[600] border-[1px] rounded-[0.3125rem] disabled:bg-[#E7E7E7] disabled:border-[#A5AFA5] disabled:text-[#A5AFA5]';
  const DASHBOARD_FILTER_FIELDS = [
    { key: 'all', label: 'Pesquisa geral', all: true },
    { key: 'name', label: 'Nome', header: 'nome' },
    { key: 'description', label: 'Descrição', header: 'descricao' },
    { key: 'status', label: 'Status', header: 'status', type: 'options', alwaysOptions: ['Rascunho'] },
    { key: 'card', label: 'Card', header: 'card relacionado' },
    { key: 'component', label: 'Componente', header: 'componente' },
    { key: 'labels', label: 'Rótulos', header: 'rotulos' }
  ];
  const EXECUTION_FILTER_FIELDS = [
    { key: 'all', label: 'Pesquisa geral', all: true },
    { key: 'robotDraft', label: 'Robô/Rascunho', header: 'robo/rascunho' },
    { key: 'status', label: 'Status', header: 'status', type: 'options' },
    { key: 'client', label: 'Cliente', header: 'cliente' },
    { key: 'environment', label: 'Ambiente', header: 'ambiente' },
    { key: 'origin', label: 'Origem', header: 'origem' },
    { key: 'createdAt', label: 'Data de criação', header: 'data criacao' },
    { key: 'startedAt', label: 'Início do processamento', header: 'inicio de processamento', optional: true },
    { key: 'finishedAt', label: 'Fim do processamento', header: 'fim de processamento', optional: true }
  ];
  const WORKFLOW_FILTER_FIELDS = [
    { key: 'all', label: 'Pesquisa geral', all: true },
    { key: 'id', label: 'ID', header: 'id' },
    { key: 'draft', label: 'Rascunho', header: 'rascunho' },
    { key: 'status', label: 'Status', header: 'status', type: 'options' },
    { key: 'createdBy', label: 'Criado por', header: 'criado por', suggestions: true },
    { key: 'tester', label: 'Tester', header: 'tester' },
    { key: 'card', label: 'Card relacionado', header: 'card relacionado' },
    { key: 'plugins', label: 'Plugins', header: 'plugins' },
    { key: 'components', label: 'Componentes', header: 'componentes' },
    { key: 'labels', label: 'Rótulos', header: 'rotulos' }
  ];
  const EXECUTION_HEADERS = ['robo/rascunho', 'status', 'cliente', 'ambiente', 'origem', 'data criacao'];
  const frames = new Set();
  const workflowSortStates = new Map();
  let savedWidths = {};
  let savedFilters = {};
  let storageLoaded = false;
  let mountQueued = false;
  let editRequestRunning = false;
  let batchCopyRunning = false;
  let bridgeSequence = 0;
  const bridgeRequests = new Map();

  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const normalizeText = value => cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tableHeaders = table => [...(table.tHead?.rows?.[0]?.cells || [])];

  function headerText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.material-symbols-outlined, .rta-column-resizer, .rta-column-filter-trigger, .rta-sort-indicator').forEach(item => item.remove());
    return normalizeText(clone.textContent);
  }

  function dashboardColumns(table) {
    const headers = tableHeaders(table);
    const labels = headers.map(headerText);
    const columns = Object.fromEntries(DASHBOARD_FILTER_FIELDS.filter(field => !field.all)
      .map(field => [field.key, labels.indexOf(field.header)]));
    return Object.values(columns).every(index => index >= 0) ? columns : null;
  }

  function workflowColumns(table) {
    const labels = tableHeaders(table).map(headerText);
    const columns = Object.fromEntries(WORKFLOW_FILTER_FIELDS.filter(field => !field.all)
      .map(field => [field.key, labels.indexOf(field.header)]));
    return Object.values(columns).every(index => index >= 0) ? columns : null;
  }

  function executionFilterColumns(table) {
    const labels = tableHeaders(table).map(headerText);
    const fields = EXECUTION_FILTER_FIELDS.filter(field => !field.all);
    const columns = Object.fromEntries(fields.map(field => [field.key, labels.indexOf(field.header)]));
    return fields.filter(field => !field.optional).every(field => columns[field.key] >= 0) ? columns : null;
  }

  function filterProfile(table) {
    const dashboard = dashboardColumns(table);
    if (dashboard) return {
      id: 'robots',
      label: 'Filtros',
      ariaLabel: 'Filtros da tabela de robôs',
      fields: DASHBOARD_FILTER_FIELDS,
      columns: dashboard,
      anchorButtons: ['exportar tudo'],
      addEditLinks: true
    };
    const workflow = workflowColumns(table);
    if (workflow) return {
      id: 'workflow',
      label: 'Criado por / Pesquisa',
      ariaLabel: 'Pesquisa e filtros da tabela de workflow',
      fields: WORKFLOW_FILTER_FIELDS,
      columns: workflow,
      anchorButtons: ['filtros']
    };
    const executions = executionFilterColumns(table);
    if (executions) return {
      id: 'executions',
      label: 'Pesquisa',
      ariaLabel: 'Pesquisa e filtros da tabela de execuções',
      fields: EXECUTION_FILTER_FIELDS.filter(field => !field.optional || executions[field.key] >= 0),
      columns: executions,
      anchorButtons: ['filtros']
    };
    return null;
  }

  function filterStorageKey(table, profile) {
    return `${location.origin}${location.pathname}|${profile.id}|${profile.fields.map(field => field.header || field.key).join('|')}`;
  }

  function currentFilters(table, profile) {
    const key = filterStorageKey(table, profile);
    if (savedFilters[key]) return savedFilters[key];
    if (profile.id === 'robots') {
      const previousFields = DASHBOARD_FILTER_FIELDS.filter(field => !field.all).map(field => field.header).join('|');
      const previousProfileKey = `${location.origin}${location.pathname}|robots|${previousFields}`;
      const legacyKey = `${location.origin}${location.pathname}|${previousFields}`;
      return savedFilters[previousProfileKey] || savedFilters[legacyKey] || {};
    }
    return {};
  }

  function saveFilters(table, profile, filters) {
    const key = filterStorageKey(table, profile);
    const clean = Object.fromEntries(Object.entries(filters).filter(([, value]) => cleanText(value)));
    if (Object.keys(clean).length) savedFilters[key] = clean;
    else delete savedFilters[key];
    chrome.storage.local.set({ [FILTER_STORAGE_KEY]: savedFilters });
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'rta-table-enhancer-page') return;
    const pending = bridgeRequests.get(event.data.token);
    if (!pending) return;
    bridgeRequests.delete(event.data.token);
    clearTimeout(pending.timeout);
    pending.resolve(String(event.data.value || ''));
  });

  function resolveCellText(element) {
    const current = cleanText(element?.textContent);
    if (!current.endsWith('...')) return Promise.resolve(current);
    const token = `rta-map-${Date.now()}-${++bridgeSequence}`;
    element.dataset.rtaCellToken = token;
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        bridgeRequests.delete(token);
        resolve(cleanText(element.textContent));
      }, 1800);
      bridgeRequests.set(token, { resolve, timeout });
      window.postMessage({ source: 'rta-table-enhancer', action: 'resolve-cell-text', token }, '*');
    });
  }

  function requestPageValue(action, element, datasetKey, timeoutMs = 1800) {
    const token = `rta-bridge-${Date.now()}-${++bridgeSequence}`;
    if (element && datasetKey) element.dataset[datasetKey] = token;
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        bridgeRequests.delete(token);
        if (element && datasetKey) delete element.dataset[datasetKey];
        resolve('');
      }, timeoutMs);
      bridgeRequests.set(token, {
        timeout,
        resolve: value => {
          if (element && datasetKey) delete element.dataset[datasetKey];
          resolve(value);
        }
      });
      window.postMessage({ source: 'rta-table-enhancer', action, token }, '*');
    });
  }

  const resolveExecutionUrl = row => requestPageValue('resolve-execution-url', row, 'rtaExecutionToken', 1500);
  const captureNextOpen = () => requestPageValue('capture-next-open', null, null, 3500);

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_) {}
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.append(input);
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('A área de transferência recusou a cópia.');
  }

  function showActionFeedback(button, message) {
    const previous = button.title;
    button.title = message;
    button.classList.add('is-success');
    setTimeout(() => {
      button.title = previous;
      button.classList.remove('is-success');
    }, 1400);
  }

  function isMappingTable(table) {
    const headers = tableHeaders(table).map(cell => cleanText(cell.textContent).toLowerCase());
    if (headers[0] !== 'chave' || headers[1] !== 'valor') return false;
    let container = table.parentElement;
    for (let depth = 0; container && depth < 7; depth++, container = container.parentElement) {
      const labels = [...container.querySelectorAll(':scope > label, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > strong')];
      if (labels.some(label => cleanText(label.textContent).toLowerCase() === 'entradas de mapeamento')) return true;
    }
    return [...table.tBodies].some(body => [...body.rows].some(row => /^https?:\/\//i.test(cleanText(row.cells[1]?.textContent))));
  }

  function mappingAction(icon, title, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rta-map-action ${className}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>`;
    return button;
  }

  function addMappingActions(table) {
    if (!isMappingTable(table)) return;
    [...table.tBodies].flatMap(body => [...body.rows]).forEach(row => {
      const valueCell = row.cells[1];
      const actionsCell = row.cells[row.cells.length - 1];
      if (!valueCell || !actionsCell || actionsCell === valueCell || actionsCell.querySelector('.rta-map-action')) return;
      const valueElement = valueCell.querySelector('span.truncate') || valueCell;
      const copy = mappingAction('content_copy', 'Copiar valor completo', 'rta-map-copy');
      const open = mappingAction('open_in_new', 'Abrir URL em nova aba', 'rta-map-open');
      copy.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const value = await resolveCellText(valueElement);
        if (!value || value.endsWith('...')) return showActionFeedback(copy, 'Não foi possível obter o valor completo');
        try {
          await copyText(value);
          showActionFeedback(copy, 'Copiado!');
        } catch (_) {
          showActionFeedback(copy, 'Não foi possível copiar');
        }
      });
      open.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const tab = window.open('about:blank', '_blank');
        const value = await resolveCellText(valueElement);
        try {
          if (!value || value.endsWith('...')) throw new Error('truncated');
          const url = new URL(value);
          if (!/^https?:$/.test(url.protocol)) throw new Error('invalid');
          if (tab) tab.location.replace(url.href);
          else showActionFeedback(open, 'Libere pop-ups para abrir a URL');
        } catch (_) {
          tab?.close();
          showActionFeedback(open, 'O valor não é uma URL válida');
        }
      });
      actionsCell.prepend(open);
      actionsCell.prepend(copy);
    });
  }

  function encodeEditTarget(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeEditTarget(value) {
    try {
      const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
    } catch (_) {
      return null;
    }
  }

  function editLauncherHref(row, columns) {
    const target = {
      name: cleanText(row.cells[columns.name]?.textContent),
      description: cleanText(row.cells[columns.description]?.textContent)
    };
    const url = new URL(location.href);
    url.hash = `rta-edit=${encodeEditTarget(target)}`;
    return url.href;
  }

  function addEditLinks(table, columns) {
    [...table.tBodies].flatMap(body => [...body.rows]).forEach(row => {
      const cell = row.cells[columns.name];
      if (!cell || cell.querySelector(':scope > .rta-robot-edit-link')) return;
      const name = cleanText(cell.textContent);
      if (!name) return;
      const link = document.createElement('a');
      link.className = 'rta-robot-edit-link';
      link.href = editLauncherHref(row, columns);
      link.title = 'Editar robô — use Ctrl+clique ou o botão do meio para abrir em outra aba';
      link.setAttribute('aria-label', `Editar ${name}`);
      link.addEventListener('click', event => event.stopPropagation());
      link.addEventListener('auxclick', event => event.stopPropagation());
      link.append(...cell.childNodes);
      cell.append(link);
    });
  }

  function findFilterPanel(frame) {
    if (frame.__rtaFilterPanel?.isConnected) return frame.__rtaFilterPanel;
    const previous = frame.previousElementSibling;
    if (!previous?.classList.contains('rta-table-filters')) return null;
    if (previous.__rtaTable && !frame.contains(previous.__rtaTable)) return null;
    frame.__rtaFilterPanel = previous;
    return previous;
  }

  function liveFilterTable(panel, profile, fallback = panel.__rtaTable) {
    const candidates = [...document.querySelectorAll('table')].filter(table => filterProfile(table)?.id === profile.id);
    if (!candidates.length) return fallback;
    const score = table => {
      const visible = table.offsetParent !== null || table.getClientRects().length > 0;
      const rows = [...table.tBodies].reduce((total, body) => total + body.rows.length, 0);
      return (visible ? 1000000 : 0) + rows;
    };
    return candidates.sort((left, right) => score(right) - score(left))[0] || fallback;
  }

  function filterFieldValues(table, profile, field) {
    const sources = [...new Set([table, ...[...document.querySelectorAll('table')]
      .filter(candidate => filterProfile(candidate)?.id === profile.id)])].filter(Boolean);
    return [...new Set([...(field.alwaysOptions || []), ...sources.flatMap(source => {
      const sourceProfile = filterProfile(source);
      const index = sourceProfile?.columns[field.key] ?? profile.columns[field.key];
      if (index == null || index < 0) return [];
      return [...source.tBodies].flatMap(body => [...body.rows])
        .map(row => cleanText(row.cells[index]?.textContent)).filter(Boolean);
    })])].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  }

  function applyFilters(table, panel, profile) {
    const fields = profile.fields;
    const columns = filterProfile(table)?.columns || profile.columns;
    const controls = panel.__rtaFilterPopover || panel;
    const rawFilters = Object.fromEntries(fields.filter(field => field.type !== 'options').map(field => [
      field.key, cleanText(controls.querySelector(`[data-rta-filter="${field.key}"]`)?.value)
    ]));
    fields.filter(field => field.type === 'options').forEach(field => {
      rawFilters[field.key] = [...controls.querySelectorAll(`[data-rta-option="${field.key}"][aria-pressed="true"]`)]
        .map(button => button.dataset.rtaValue);
    });
    const filters = Object.fromEntries(Object.entries(rawFilters).map(([key, value]) => [
      key, Array.isArray(value) ? value.map(normalizeText) : normalizeText(value)
    ]));
    let visible = 0;
    let total = 0;
    [...table.tBodies].flatMap(body => [...body.rows]).forEach(row => {
      total++;
      const matches = fields.every(field => {
        const filter = filters[field.key];
        const value = field.all
          ? normalizeText(Object.values(columns).map(index => row.cells[index]?.textContent).join(' '))
          : normalizeText(row.cells[columns[field.key]]?.textContent);
        if (field.type === 'options') return !filter.length || filter.includes(value);
        return !filter || value.includes(filter);
      });
      row.classList.toggle('rta-filtered-out', !matches);
      if (matches) visible++;
    });
    const count = controls.querySelector('[data-rta-filter-count]');
    if (count) count.textContent = Object.values(filters).some(value => Array.isArray(value) ? value.length : value) ? `${visible} de ${total} nesta página` : `${total} nesta página`;
    const activeCount = Object.values(filters).filter(value => Array.isArray(value) ? value.length : value).length;
    const badge = panel.querySelector('[data-rta-filter-badge]');
    if (badge) {
      badge.textContent = String(activeCount);
      badge.hidden = !activeCount;
    }
    return Object.fromEntries(Object.entries(rawFilters).filter(([, value]) => Array.isArray(value) ? value.length : value));
  }

  function updateFilterOptions(table, panel, profile, restored = {}) {
    const fields = profile.fields;
    const controls = panel.__rtaFilterPopover || panel;
    fields.filter(field => field.type === 'options').forEach(field => {
      const container = controls.querySelector(`[data-rta-options="${field.key}"]`);
      if (!container) return;
      const selected = new Set([
        ...(Array.isArray(restored[field.key]) ? restored[field.key] : restored[field.key] ? [restored[field.key]] : []),
        ...[...container.querySelectorAll(`[data-rta-option="${field.key}"][aria-pressed="true"]`)]
          .map(button => button.dataset.rtaValue)
      ].map(normalizeText));
      const values = filterFieldValues(table, profile, field);
      const signature = JSON.stringify(values);
      const renderedSignature = JSON.stringify([...container.querySelectorAll(`[data-rta-option="${field.key}"]`)]
        .map(button => cleanText(button.dataset.rtaValue)));
      if (container.dataset.rtaOptions === signature && renderedSignature === signature) return;
      container.dataset.rtaOptions = signature;
      container.replaceChildren(...values.map(value => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rta-status-option';
        button.dataset.rtaOption = field.key;
        button.dataset.rtaValue = value;
        button.textContent = value;
        button.setAttribute('aria-pressed', String(selected.has(normalizeText(value))));
        button.addEventListener('click', () => {
          button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
          const currentTable = liveFilterTable(panel, profile, table);
          panel.__rtaTable = currentTable;
          saveFilters(currentTable, profile, applyFilters(currentTable, panel, profile));
        });
        return button;
      }));
    });
    fields.filter(field => field.suggestions).forEach(field => {
      const container = controls.querySelector(`[data-rta-suggestions="${field.key}"]`);
      if (!container) return;
      const values = filterFieldValues(table, profile, field);
      const signature = JSON.stringify(values);
      if (container.dataset.rtaOptions === signature && container.children.length === values.length) return;
      container.dataset.rtaOptions = signature;
      container.replaceChildren(...values.map(value => {
        const option = document.createElement('option');
        option.value = value;
        return option;
      }));
    });
  }

  function placeFilterButton(table, frame, panel, profile) {
    let scope = frame.parentElement;
    for (let depth = 0; scope && depth < 7; depth++, scope = scope.parentElement) {
      const anchorButton = [...scope.querySelectorAll('button')].find(button =>
        !panel.contains(button) && profile.anchorButtons.some(label => buttonText(button) === label || buttonText(button).includes(label))
      );
      if (!anchorButton) continue;
      let anchor = panel.__rtaFilterAnchor;
      if (!anchor?.isConnected) {
        anchor = document.createElement('span');
        anchor.className = 'rta-filter-anchor';
        anchor.setAttribute('aria-hidden', 'true');
        panel.__rtaFilterAnchor = anchor;
      }
      anchorButton.insertAdjacentElement('afterend', anchor);
      if (panel.parentElement !== document.body) document.body.append(panel);
      panel.classList.add('is-in-toolbar');
      positionFilterButton(panel);
      return;
    }
    panel.__rtaFilterAnchor?.remove();
    panel.__rtaFilterAnchor = null;
    panel.style.removeProperty('top');
    panel.style.removeProperty('left');
    if (panel.nextElementSibling !== frame) frame.before(panel);
    panel.classList.remove('is-in-toolbar');
  }

  function positionFilterButton(panel) {
    const anchor = panel.__rtaFilterAnchor;
    const toggle = panel.querySelector('.rta-filter-toggle');
    if (!anchor?.isConnected || !toggle) return;
    const toggleRect = toggle.getBoundingClientRect();
    if (toggleRect.width) {
      anchor.style.width = `${toggleRect.width}px`;
      anchor.style.height = `${toggleRect.height}px`;
    }
    const rect = anchor.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
  }

  function positionFilterPopover(panel) {
    const toggle = panel.querySelector('.rta-filter-toggle');
    const popover = panel.__rtaFilterPopover;
    if (!toggle || !popover) return;
    const rect = toggle.getBoundingClientRect();
    const width = Math.min(860, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16));
    const height = Math.min(popover.scrollHeight || 360, window.innerHeight - 32);
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight - 16 ? below : Math.max(16, rect.top - height - 8);
    popover.style.width = `${width}px`;
    popover.style.left = `${left}px`;
    popover.style.right = 'auto';
    popover.style.top = `${top}px`;
    popover.style.maxHeight = `${Math.max(120, window.innerHeight - top - 16)}px`;
  }

  function refreshFilterPanel(panel) {
    if (!panel.__rtaProfile) return;
    const currentTable = liveFilterTable(panel, panel.__rtaProfile);
    if (!currentTable?.isConnected) return;
    panel.__rtaTable = currentTable;
    updateFilterOptions(currentTable, panel, panel.__rtaProfile);
    applyFilters(currentTable, panel, panel.__rtaProfile);
  }

  function setFilterOpen(panel, open) {
    const toggle = panel.querySelector('.rta-filter-toggle');
    const popover = panel.__rtaFilterPopover;
    if (!toggle || !popover) return;
    panel.classList.toggle('is-collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      refreshFilterPanel(panel);
      if (popover.parentElement !== document.body) document.body.append(popover);
      popover.hidden = false;
      positionFilterPopover(panel);
      requestAnimationFrame(() => {
        if (!panel.classList.contains('is-collapsed')) {
          refreshFilterPanel(panel);
          positionFilterPopover(panel);
        }
      });
    } else {
      popover.hidden = true;
    }
  }

  function enhanceFilterableTable(table, frame) {
    const profile = filterProfile(table);
    if (!profile) return;
    if (!visibleElement(table) && [...document.querySelectorAll('table')].some(candidate =>
      candidate !== table && visibleElement(candidate) && filterProfile(candidate)?.id === profile.id
    )) return;
    let panel = findFilterPanel(frame);
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'rta-table-filters is-collapsed';
      panel.setAttribute('aria-label', profile.ariaLabel);
      const generalField = profile.fields.find(field => field.all);
      const generalSearch = generalField ? `<label class="rta-filter-general"><span>${generalField.label}</span><div class="rta-filter-general-control"><span class="material-symbols-outlined" aria-hidden="true">search</span><input type="search" data-rta-filter="${generalField.key}" placeholder="Pesquisar em todas as colunas" autocomplete="off"></div></label>` : '';
      const textFields = profile.fields.filter(field => field.type !== 'options' && !field.all)
        .map(field => `<label>${field.label}<input type="search" data-rta-filter="${field.key}" placeholder="Filtrar ${field.label.toLowerCase()}" autocomplete="off"${field.suggestions ? ` list="rta-${profile.id}-${field.key}"` : ''}></label>`).join('');
      const suggestions = profile.fields.filter(field => field.suggestions)
        .map(field => `<datalist id="rta-${profile.id}-${field.key}" data-rta-suggestions="${field.key}"></datalist>`).join('');
      const optionFields = profile.fields.filter(field => field.type === 'options')
        .map(field => `<fieldset class="rta-status-filter"><legend>${field.label} <small>selecione um ou mais</small></legend><div class="rta-status-options" data-rta-options="${field.key}"></div></fieldset>`).join('');
      panel.innerHTML = `<button type="button" class="rta-filter-toggle ${NATIVE_FILTER_BUTTON_CLASSES}" aria-expanded="false"><svg stroke="currentColor" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H5a1 1 0 0 0-1 1v2.59c0 .523.213 1.037.583 1.407L10 13.414V21a1.001 1.001 0 0 0 1.447.895l4-2c.339-.17.553-.516.553-.895v-5.586l5.417-5.417c.37-.37.583-.884.583-1.407V4a1 1 0 0 0-1-1zm-6.707 9.293A.996.996 0 0 0 14 13v5.382l-2 1V13a.996.996 0 0 0-.293-.707L6 6.59V5h14.001l.002 1.583-5.71 5.71z"></path></svg><span class="uppercase">${profile.label}</span><span class="rta-filter-badge" data-rta-filter-badge hidden>0</span></button><div class="rta-filter-popover" hidden><div class="rta-filter-header"><div><strong>Pesquisar nesta tabela</strong><small>Combine a pesquisa geral com filtros específicos</small></div><button type="button" class="rta-filter-close" data-rta-filter-close aria-label="Fechar filtros"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></div><div class="rta-filter-body">${generalSearch}<div class="rta-filter-section-title">Filtros por coluna</div><div class="rta-filter-grid">${textFields}</div>${suggestions}${optionFields}</div><div class="rta-filter-footer"><span data-rta-filter-count></span><button type="button" class="rta-filter-clear">Limpar filtros</button></div></div>`;
      panel.__rtaFilterPopover = panel.querySelector('.rta-filter-popover');
      panel.__rtaFilterPopover.__rtaFilterPanel = panel;
      frame.before(panel);
      frame.__rtaFilterPanel = panel;
      const restored = currentFilters(table, profile);
      profile.fields.filter(field => field.type !== 'options').forEach(field => {
        const input = panel.querySelector(`[data-rta-filter="${field.key}"]`);
        input.value = restored[field.key] || '';
        input.addEventListener('input', () => {
          const currentTable = liveFilterTable(panel, profile, table);
          panel.__rtaTable = currentTable;
          saveFilters(currentTable, profile, applyFilters(currentTable, panel, profile));
        });
      });
      panel.__rtaFilterPopover.querySelector('.rta-filter-clear').addEventListener('click', () => {
        panel.__rtaFilterPopover.querySelectorAll('[data-rta-filter]').forEach(input => { input.value = ''; });
        panel.__rtaFilterPopover.querySelectorAll('[data-rta-option]').forEach(button => button.setAttribute('aria-pressed', 'false'));
        const currentTable = liveFilterTable(panel, profile, table);
        panel.__rtaTable = currentTable;
        saveFilters(currentTable, profile, applyFilters(currentTable, panel, profile));
      });
      panel.__rtaFilterPopover.querySelector('[data-rta-filter-close]').addEventListener('click', () => setFilterOpen(panel, false));
      document.addEventListener('pointerdown', event => {
        if (panel.isConnected && !panel.contains(event.target) && !panel.__rtaFilterPopover?.contains(event.target)) {
          setFilterOpen(panel, false);
        }
      });
      updateFilterOptions(table, panel, profile, restored);
    }
    panel.__rtaTable = table;
    panel.__rtaProfile = profile;
    placeFilterButton(table, frame, panel, profile);
    positionFilterButton(panel);
    if (!panel.classList.contains('is-collapsed')) positionFilterPopover(panel);
    updateFilterOptions(table, panel, profile);
    if (profile.addEditLinks) addEditLinks(table, profile.columns);
    applyFilters(table, panel, profile);
    if (profile.id === 'workflow') enhanceWorkflowSorting(table, profile);
  }

  function buttonText(button) {
    const clone = button.cloneNode(true);
    clone.querySelectorAll('svg, .material-symbols-outlined, .rta-action-badge').forEach(item => item.remove());
    return normalizeText(clone.textContent);
  }

  function workflowSortKey() {
    return `${location.origin}${location.pathname}`;
  }

  function applyWorkflowSort(table, profile) {
    const state = workflowSortStates.get(workflowSortKey());
    const headers = tableHeaders(table);
    headers.forEach((header, index) => {
      const active = state?.columnIndex === index;
      header.setAttribute('aria-sort', active ? (state.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      const indicator = header.querySelector(':scope > .rta-sort-indicator');
      const icon = active ? (state.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
      if (indicator && indicator.textContent !== icon) indicator.textContent = icon;
    });
    if (!state || !headers[state.columnIndex]) return;
    const direction = state.direction === 'desc' ? -1 : 1;
    const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    [...table.tBodies].forEach(body => {
      const rows = [...body.rows];
      const sorted = rows.map((row, position) => ({ row, position, value: cleanText(row.cells[state.columnIndex]?.textContent) }))
        .sort((left, right) => {
          if (!left.value && !right.value) return left.position - right.position;
          if (!left.value) return 1;
          if (!right.value) return -1;
          return collator.compare(left.value, right.value) * direction || left.position - right.position;
        })
        .map(item => item.row);
      if (sorted.some((row, index) => row !== rows[index])) body.append(...sorted);
    });
  }

  function enhanceWorkflowSorting(table, profile) {
    const sortableColumns = [...new Set(profile.fields.filter(field => !field.all)
      .map(field => profile.columns[field.key]).filter(index => index >= 0))];
    sortableColumns.forEach(index => {
      const header = tableHeaders(table)[index];
      if (!header) return;
      header.classList.add('rta-workflow-sortable');
      if (!header.querySelector(':scope > .rta-sort-indicator')) {
        const indicator = document.createElement('span');
        indicator.className = 'material-symbols-outlined rta-sort-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        header.insertBefore(indicator, header.querySelector(':scope > .rta-column-resizer'));
      }
      if (header.dataset.rtaWorkflowSort === 'true') return;
      header.dataset.rtaWorkflowSort = 'true';
      header.title = `${header.title ? `${header.title} — ` : ''}Clique para ordenar`;
      header.addEventListener('click', event => {
        if (event.button !== 0 || event.target.closest?.('.rta-column-resizer, button, input, a, [role="checkbox"]')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = workflowSortStates.get(workflowSortKey());
        workflowSortStates.set(workflowSortKey(), {
          columnIndex: index,
          direction: current?.columnIndex === index && current.direction === 'asc' ? 'desc' : 'asc'
        });
        applyWorkflowSort(table, profile);
      });
    });
    applyWorkflowSort(table, profile);
  }

  function executionColumns(table) {
    const labels = tableHeaders(table).map(headerText);
    if (!EXECUTION_HEADERS.every(header => labels.includes(header))) return null;
    return { select: 0, actions: labels.length - 1 };
  }

  function selectedExecutionRows(table) {
    return [...table.tBodies].flatMap(body => [...body.rows]).filter(row => {
      const checkbox = row.cells[0]?.querySelector('[role="checkbox"]');
      return checkbox?.getAttribute('aria-checked') === 'true' || checkbox?.dataset.state === 'checked';
    });
  }

  function visibleElement(element) {
    return Boolean(element?.isConnected && (element.offsetParent !== null || element.getClientRects().length));
  }

  function findInspectorDialog() {
    return [...document.querySelectorAll('[role="dialog"], [data-radix-dialog-content]')].find(dialog =>
      visibleElement(dialog) && normalizeText(dialog.textContent).includes('inspecionar requisicao')
    ) || null;
  }

  function findInspectorPage() {
    const heading = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')].find(element =>
      visibleElement(element) && normalizeText(element.textContent).includes('inspecionar requisicao')
    );
    return heading?.closest('[role="dialog"], main') || (heading ? document.querySelector('main') || document.body : null);
  }

  function urlFromValue(value) {
    const match = String(value || '').match(/https?:\/\/[^\s"'<>]+/i);
    return match?.[0]?.replace(/[),.;]+$/, '') || '';
  }

  async function requestUrlFromInspector(dialog) {
    const labelled = [...dialog.querySelectorAll('input, textarea, a, code, pre, [data-url]')].filter(element => {
      const label = element.getAttribute('aria-label') || element.getAttribute('name') || element.getAttribute('data-label') || element.closest('label')?.textContent || '';
      return normalizeText(label).includes('url');
    });
    const truncated = dialog.ownerDocument === document ? ', span.truncate' : '';
    const candidates = [...labelled, ...dialog.querySelectorAll(`input, textarea, a[href], code, pre, [data-url]${truncated}`)];
    for (const element of candidates) {
      const raw = element.value || element.dataset?.url || element.getAttribute?.('href') || await resolveCellText(element);
      const url = urlFromValue(raw);
      if (url) return url;
    }
    return urlFromValue(dialog.textContent);
  }

  async function requestUrlFromInspectionPage(pageUrl) {
    const url = new URL(pageUrl, location.href);
    if (!/^https?:$/.test(url.protocol)) return '';
    if (url.origin !== location.origin) return url.href;
    const frame = document.createElement('iframe');
    frame.className = 'rta-inspection-frame';
    frame.src = url.href;
    frame.setAttribute('aria-hidden', 'true');
    document.body.append(frame);
    try {
      const end = Date.now() + 12000;
      while (Date.now() < end) {
        try {
          const doc = frame.contentDocument;
          const heading = [...(doc?.querySelectorAll('h1, h2, h3, [role="heading"]') || [])].find(element => normalizeText(element.textContent).includes('inspecionar requisicao'));
          const container = heading?.closest('[role="dialog"], main') || (heading ? doc.body : null);
          if (container) {
            const requestUrl = await requestUrlFromInspector(container);
            if (requestUrl) return requestUrl;
          }
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return '';
    } finally {
      frame.remove();
    }
  }

  function inspectorAction() {
    return [...document.querySelectorAll('[role="menuitem"], [role="option"], button')].find(element =>
      visibleElement(element) && normalizeText(element.textContent).includes('inspecionar requisicao')
    );
  }

  async function closeInspector(dialog) {
    const close = [...dialog.querySelectorAll('button')].find(button => {
      const label = normalizeText(`${button.getAttribute('aria-label') || ''} ${buttonText(button)}`);
      return /(^|\s)(fechar|close)(\s|$)/.test(label);
    });
    if (close) clickLikeUser(close);
    else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
    }
    const closed = await waitFor(() => !visibleElement(dialog), 3000);
    if (!closed) throw new Error('Não foi possível fechar a inspeção antes da próxima execução.');
  }

  async function inspectExecutionRow(row) {
    const reactUrl = urlFromValue(await resolveExecutionUrl(row));
    if (reactUrl) return reactUrl;
    const actionButton = [...row.querySelectorAll('button')].find(button => button.getAttribute('aria-haspopup') === 'menu') || row.cells[row.cells.length - 1]?.querySelector('button');
    if (!actionButton) throw new Error('Menu da execução não encontrado.');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    clickLikeUser(actionButton);
    const inspect = await waitFor(inspectorAction, 3000);
    if (!inspect) throw new Error('A opção Inspecionar requisição não foi encontrada.');
    const actionUrl = urlFromValue(await resolveExecutionUrl(inspect));
    if (actionUrl && new URL(actionUrl, location.href).origin !== location.origin) return actionUrl;
    const link = inspect.closest('a[href]') || inspect.querySelector?.('a[href]');
    if (link?.href) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      const linkedUrl = await requestUrlFromInspectionPage(link.href);
      if (!linkedUrl) throw new Error('A URL não foi encontrada na inspeção em segundo plano.');
      return linkedUrl;
    }
    const startingUrl = location.href;
    let capturedUrl = '';
    captureNextOpen().then(value => { capturedUrl = value; });
    await new Promise(resolve => setTimeout(resolve, 50));
    clickLikeUser(inspect);
    const surface = await waitFor(() => findInspectorDialog() || capturedUrl || location.href !== startingUrl, 5000);
    if (!surface) throw new Error('A inspeção da requisição não abriu.');
    if (typeof surface === 'string') {
      const backgroundUrl = await requestUrlFromInspectionPage(surface);
      if (!backgroundUrl) throw new Error('A URL não foi encontrada na inspeção em segundo plano.');
      return backgroundUrl;
    }
    if (location.href !== startingUrl && !findInspectorDialog()) {
      const page = await waitFor(findInspectorPage, 5000);
      if (!page) throw new Error('A tela de inspeção não carregou.');
      const pageUrl = await requestUrlFromInspector(page);
      history.back();
      await waitFor(() => location.href === startingUrl && [...document.querySelectorAll('table')].some(executionColumns), 6000);
      if (!pageUrl) throw new Error('A URL não foi encontrada na tela de inspeção.');
      return pageUrl;
    }
    const url = await requestUrlFromInspector(surface);
    await closeInspector(surface);
    if (!url) throw new Error('A URL da requisição não foi encontrada.');
    return url;
  }

  function updateBatchCopyButton(table, button) {
    const count = selectedExecutionRows(table).length;
    if (!batchCopyRunning) button.disabled = count === 0;
    const badge = button.querySelector('[data-rta-url-count]');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    button.title = count ? `Copiar URL de ${count} requisição(ões) selecionada(s)` : 'Selecione uma ou mais execuções';
  }

  function addBatchCopyButton(table) {
    let scope = table.parentElement;
    let exportButton;
    let cancelButton;
    for (let depth = 0; scope && depth < 8; depth++, scope = scope.parentElement) {
      const buttons = [...scope.querySelectorAll('button')].filter(button => !button.closest('.rta-table-filters'));
      exportButton = buttons.find(button => buttonText(button).startsWith('exportar'));
      cancelButton = buttons.find(button => buttonText(button).startsWith('cancelar em lote'));
      if (exportButton && cancelButton) break;
    }
    if (!exportButton || !cancelButton) return;
    let button = cancelButton.parentElement.querySelector(':scope > [data-rta-copy-urls]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = `${exportButton.className} rta-copy-urls-button`;
      button.dataset.rtaCopyUrls = 'true';
      button.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">link</span><span>COPIAR URLs</span><span class="rta-action-badge" data-rta-url-count hidden>0</span>';
      cancelButton.before(button);
      button.addEventListener('click', async () => {
        if (batchCopyRunning) return;
        const rows = selectedExecutionRows(table);
        if (!rows.length) return;
        batchCopyRunning = true;
        button.disabled = true;
        const label = button.querySelector('span:nth-child(2)');
        const urls = [];
        const failures = [];
        try {
          for (let index = 0; index < rows.length; index++) {
            label.textContent = `COPIANDO ${index + 1}/${rows.length}`;
            try { urls.push(await inspectExecutionRow(rows[index])); }
            catch (error) { failures.push(error.message); }
          }
          if (!urls.length) throw new Error(failures[0] || 'Nenhuma URL foi encontrada.');
          await copyText(urls.join('\n'));
          showActionFeedback(button, failures.length ? `${urls.length} URL(s) copiada(s); ${failures.length} não encontrada(s)` : `${urls.length} URL(s) copiada(s)`);
        } catch (error) {
          showActionFeedback(button, error.message);
        } finally {
          label.textContent = 'COPIAR URLs';
          batchCopyRunning = false;
          updateBatchCopyButton(table, button);
        }
      });
    }
    updateBatchCopyButton(table, button);
  }

  function enhanceInspectorDialog() {
    const dialog = findInspectorDialog() || findInspectorPage();
    if (!dialog || dialog.querySelector('[data-rta-copy-request-url]')) return;
    const title = [...dialog.querySelectorAll('h1, h2, h3, [role="heading"]')].find(element => normalizeText(element.textContent).includes('inspecionar requisicao'));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rta-copy-request-url';
    button.dataset.rtaCopyRequestUrl = 'true';
    button.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span><span>Copiar URL</span>';
    button.addEventListener('click', async () => {
      const url = await requestUrlFromInspector(dialog);
      if (!url) return showActionFeedback(button, 'URL não encontrada');
      try {
        await copyText(url);
        showActionFeedback(button, 'URL copiada!');
      } catch (_) {
        showActionFeedback(button, 'Não foi possível copiar');
      }
    });
    (title?.parentElement || dialog).append(button);
  }

  function clickLikeUser(element) {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    element.click();
  }

  async function waitFor(find, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const result = find();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  async function openRequestedEditor() {
    if (editRequestRunning || !location.hash.startsWith(EDIT_HASH_PREFIX)) return;
    const target = decodeEditTarget(location.hash.slice(EDIT_HASH_PREFIX.length));
    if (!target?.name) return;
    editRequestRunning = true;
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    try {
      const row = await waitFor(() => {
        const tables = [...document.querySelectorAll('table')];
        for (const table of tables) {
          const columns = dashboardColumns(table);
          if (!columns) continue;
          const match = [...table.tBodies].flatMap(body => [...body.rows]).find(item =>
            cleanText(item.cells[columns.name]?.textContent) === target.name &&
            (!target.description || cleanText(item.cells[columns.description]?.textContent) === target.description)
          );
          if (match) return match;
        }
        return null;
      }, 15000);
      if (!row) throw new Error(`Robô “${target.name}” não encontrado nesta página.`);
      const menuButton = [...row.querySelectorAll('button')].find(button => button.getAttribute('aria-haspopup') === 'menu') || row.querySelector('td:last-child button');
      if (!menuButton) throw new Error('Menu de ações do robô não encontrado.');
      clickLikeUser(menuButton);
      const edit = await waitFor(() => [...document.querySelectorAll('[role="menuitem"], [role="option"], button')]
        .find(item => item.offsetParent !== null && /editar(?:\s+rob[oô])?$/i.test(cleanText(item.textContent))), 3000);
      if (!edit) throw new Error('A ação Editar não foi encontrada no menu.');
      clickLikeUser(edit);
    } catch (error) {
      console.warn('[RTA edição em nova aba]', error);
      alert(`Não foi possível abrir a edição automaticamente. ${error.message}`);
    } finally {
      editRequestRunning = false;
    }
  }

  function tableKey(table) {
    const names = tableHeaders(table).map((cell, index) => {
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('.rta-column-filter-trigger, .rta-sort-indicator').forEach(item => item.remove());
      return cleanText(clone.textContent) || `coluna-${index + 1}`;
    });
    return `${location.pathname}|${names.join('|')}`;
  }

  async function loadStorage() {
    if (storageLoaded) return;
    const value = await chrome.storage.local.get([STORAGE_KEY, FILTER_STORAGE_KEY]);
    savedWidths = value[STORAGE_KEY] && typeof value[STORAGE_KEY] === 'object' ? value[STORAGE_KEY] : {};
    savedFilters = value[FILTER_STORAGE_KEY] && typeof value[FILTER_STORAGE_KEY] === 'object' ? value[FILTER_STORAGE_KEY] : {};
    storageLoaded = true;
  }

  function saveTable(table) {
    const cols = [...table.querySelectorAll(':scope > colgroup.rta-column-widths > col')];
    savedWidths[table.dataset.rtaTableKey] = cols.map(col => Math.round(parseFloat(col.style.width) || MIN_WIDTH));
    chrome.storage.local.set({ [STORAGE_KEY]: savedWidths });
  }

  function updateTableWidth(table) {
    const cols = [...table.querySelectorAll(':scope > colgroup.rta-column-widths > col')];
    const total = cols.reduce((sum, col) => sum + (parseFloat(col.style.width) || MIN_WIDTH), 0);
    table.style.width = `${Math.ceil(total)}px`;
  }

  function applyColumnWidth(table, index, width) {
    const col = table.querySelector(`:scope > colgroup.rta-column-widths > col:nth-child(${index + 1})`);
    if (!col) return;
    col.style.width = `${Math.max(MIN_WIDTH, Math.round(width))}px`;
    updateTableWidth(table);
  }

  function autoWidth(table, index) {
    const cells = [...table.rows].map(row => row.cells[index]).filter(Boolean);
    const natural = Math.min(600, Math.max(MIN_WIDTH, ...cells.map(cell => {
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('.rta-column-resizer, .rta-sort-indicator').forEach(item => item.remove());
      const ruler = document.createElement('div');
      ruler.style.cssText = 'position:fixed;left:-10000px;top:0;width:max-content;max-width:none;white-space:nowrap;visibility:hidden;padding:0 32px;font:inherit';
      ruler.append(...clone.childNodes);
      document.body.append(ruler);
      const width = ruler.getBoundingClientRect().width;
      ruler.remove();
      return width;
    })));
    applyColumnWidth(table, index, natural);
    saveTable(table);
  }

  function addResizer(table, header, index) {
    if (header.querySelector(':scope > .rta-column-resizer')) return;
    const handle = document.createElement('span');
    handle.className = 'rta-column-resizer';
    handle.title = 'Arraste para redimensionar; duplo clique para ajustar automaticamente';
    handle.setAttribute('aria-hidden', 'true');

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const col = table.querySelector(`:scope > colgroup.rta-column-widths > col:nth-child(${index + 1})`);
      const startWidth = parseFloat(col?.style.width) || header.getBoundingClientRect().width;
      handle.classList.add('is-dragging');
      document.documentElement.classList.add('rta-resizing-column');
      handle.setPointerCapture?.(event.pointerId);

      const move = moveEvent => applyColumnWidth(table, index, startWidth + moveEvent.clientX - startX);
      const finish = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        handle.classList.remove('is-dragging');
        document.documentElement.classList.remove('rta-resizing-column');
        saveTable(table);
        window.postMessage({ source: 'rta-table-enhancer', action: 'hydrate-column', tableKey: table.dataset.rtaTableKey, columnIndex: index }, '*');
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });

    handle.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      autoWidth(table, index);
      window.postMessage({ source: 'rta-table-enhancer', action: 'hydrate-column', tableKey: table.dataset.rtaTableKey, columnIndex: index }, '*');
    });
    handle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    header.append(handle);
  }

  function resizeFrame(frame) {
    if (!frame.isConnected) {
      frames.delete(frame);
      return;
    }
    if (!frame.classList.contains('rta-table-frame-scroll')) {
      frame.style.removeProperty('height');
      return;
    }
    const top = frame.getBoundingClientRect().top;
    const reservedForPagination = 92;
    frame.style.height = `${Math.max(280, window.innerHeight - Math.max(0, top) - reservedForPagination)}px`;
  }

  function isDataTable(table) {
    const headers = tableHeaders(table);
    return table.classList.contains('caption-bottom') && headers.length >= 2 &&
      table.tBodies.length > 0 && headers.some(cell => cleanText(cell.textContent));
  }

  function enhance(table) {
    if (!isDataTable(table)) return;
    const headers = tableHeaders(table);
    const originalWidths = headers.map(header =>
      Math.max(MIN_WIDTH, Math.round(header.getBoundingClientRect().width))
    );
    table.dataset.rtaResizable = 'true';
    if (!table.dataset.rtaTableKey) table.dataset.rtaTableKey = tableKey(table);
    table.classList.add('rta-resizable-table');

    let frame = table.parentElement;
    if (!frame?.classList.contains('rta-table-frame')) {
      frame = document.createElement('div');
      frame.className = 'rta-table-frame';
      table.before(frame);
      frame.append(table);
    }
    frames.add(frame);
    frame.classList.remove('rta-table-frame-scroll');

    let colgroup = table.querySelector(':scope > colgroup.rta-column-widths');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      colgroup.className = 'rta-column-widths';
      table.prepend(colgroup);
    }

    const stored = savedWidths[table.dataset.rtaTableKey];
    while (colgroup.children.length < headers.length) colgroup.append(document.createElement('col'));
    while (colgroup.children.length > headers.length) colgroup.lastElementChild.remove();
    [...colgroup.children].forEach((col, index) => {
      const current = parseFloat(col.style.width);
      col.style.width = `${stored?.[index] || current || originalWidths[index]}px`;
    });
    headers.forEach((header, index) => addResizer(table, header, index));
    addMappingActions(table);
    enhanceFilterableTable(table, frame);
    if (executionColumns(table)) addBatchCopyButton(table);
    updateTableWidth(table);
    resizeFrame(frame);
    window.postMessage({ source: 'rta-table-enhancer', action: 'restore-text' }, '*');
    if (stored && !table.dataset.rtaTextHydrationRequested) {
      table.dataset.rtaTextHydrationRequested = 'true';
      headers.forEach((_, columnIndex) => {
        window.postMessage({ source: 'rta-table-enhancer', action: 'hydrate-column', tableKey: table.dataset.rtaTableKey, columnIndex }, '*');
      });
    }
  }

  async function mount() {
    mountQueued = false;
    await loadStorage();
    document.querySelectorAll('table').forEach(enhance);
    frames.forEach(resizeFrame);
    document.querySelectorAll('.rta-table-filters').forEach(panel => {
      const preferredTable = panel.__rtaProfile ? liveFilterTable(panel, panel.__rtaProfile) : panel.__rtaTable;
      const staleHiddenPanel = preferredTable && preferredTable !== panel.__rtaTable &&
        visibleElement(preferredTable) && !visibleElement(panel.__rtaTable);
      if (!panel.__rtaTable?.isConnected || staleHiddenPanel) {
        panel.__rtaFilterAnchor?.remove();
        panel.__rtaFilterPopover?.remove();
        panel.remove();
      }
    });
    document.querySelectorAll('body > .rta-filter-popover').forEach(popover => {
      if (!popover.__rtaFilterPanel?.isConnected) popover.remove();
    });
    enhanceInspectorDialog();
    openRequestedEditor();
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(() => mount().catch(console.error));
  }

  new MutationObserver(queueMount).observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'data-state'] });
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('.rta-filter-toggle');
    if (!toggle) return;
    const panel = toggle.closest('.rta-table-filters');
    if (!panel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setFilterOpen(panel, panel.classList.contains('is-collapsed'));
  }, true);
  window.addEventListener('resize', queueMount, { passive: true });
  window.addEventListener('scroll', () => {
    document.querySelectorAll('.rta-table-filters.is-in-toolbar').forEach(panel => {
      positionFilterButton(panel);
      if (!panel.classList.contains('is-collapsed')) positionFilterPopover(panel);
    });
  }, { passive: true, capture: true });
  window.addEventListener('hashchange', openRequestedEditor);
  queueMount();
})();
