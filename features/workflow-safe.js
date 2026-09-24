(() => {
  'use strict';
  if (window.__RTA_WORKFLOW_SAFE_1270__) return;
  window.__RTA_WORKFLOW_SAFE_1270__ = true;

  const IS_STG = location.hostname === 'stg.automation.dootax.com.br';
  const API = 'https://api.stg.automation.dootax.com.br/api';
  const FEATURE_KEY = 'rtaFeaturesV1';
  let enabled = true;
  let scheduled = false;
  let drafts = [];
  let draftLoadStarted = false;
  let workflows = [];
  let workflowLoadStarted = false;
  let actionBusy = false;
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function headers(table) {
    return [...(table.tHead?.rows?.[0]?.cells || [])].map(c => norm(c.textContent));
  }
  function workflowTable() {
    if (!location.pathname.includes('/dootax/workflow')) return null;
    return [...document.querySelectorAll('table')].find(t => {
      const h = headers(t);
      return h.some(x => x.startsWith('id')) && h.some(x => x.startsWith('rascunho')) && h.some(x => x.startsWith('status')) && h.some(x => x.startsWith('criado por'));
    }) || null;
  }
  function dashboardTable() {
    if (!location.pathname.includes('/dootax/dashboard')) return null;
    return [...document.querySelectorAll('table')].find(t => {
      const h = headers(t);
      return h.some(x => x.startsWith('nome')) && h.some(x => x.startsWith('descricao')) && h.some(x => x.startsWith('status'));
    }) || null;
  }
  function col(table, label) { return headers(table).findIndex(x => x === label || x.startsWith(label)); }
  function cell(row, table, label) { const i = col(table, label); return i >= 0 ? clean(row.cells[i]?.textContent) : ''; }
  function rows(table) { return table ? [...table.querySelectorAll('tbody tr')] : []; }

  function statusKind(text) {
    const s = norm(text);
    if (s.includes('atribuicao') && s.includes('qa')) return 'qa-assign';
    if (s.includes('testes') && s.includes('qa')) return 'qa-tests';
    if (s.includes('revisao') || s.includes('code review')) return 'review';
    if (s.includes('aprovacao') || s.includes('aguardando po')) return 'approval';
    if (s.includes('reprov')) return 'reproved';
    if (s.includes('conclu') || s.includes('aprovado')) return 'done';
    return 'other';
  }
  function statusLabel(kind, raw) {
    return ({'qa-assign':'Aguardando QA','qa-tests':'Testes dos QAs',review:'Revisão',approval:'Aprovação',reproved:'Reprovados',done:'Concluídos',other:raw || 'Outros'})[kind];
  }

  function paintWorkflow(table) {
    rows(table).forEach(row => {
      [...row.classList].filter(x => x.startsWith('rta-wfs-')).forEach(x => row.classList.remove(x));
      row.classList.add('rta-wfs-' + statusKind(cell(row, table, 'status')));
    });
  }

  function ensureSelectors(table) {
    const head = table.tHead?.rows?.[0];
    if (!head) return;
    const idIndex = col(table, 'id');
    if (idIndex < 0) return;
    const th = head.cells[idIndex];
    if (!th.querySelector('[data-rta-wf-select-all]')) {
      const box = document.createElement('input');
      box.type = 'checkbox'; box.dataset.rtaWfSelectAll = '1'; box.className = 'rta-wf-check'; box.title = 'Selecionar todos os itens visíveis';
      box.addEventListener('change', () => {
        rows(table).filter(r => r.offsetParent !== null).forEach(r => { const c=r.querySelector('[data-rta-wf-select]'); if(c) c.checked=box.checked; });
        renderSelection(table);
      });
      th.prepend(box);
    }
    rows(table).forEach(row => {
      const td = row.cells[idIndex];
      if (!td || td.querySelector('[data-rta-wf-select]')) return;
      const box = document.createElement('input');
      box.type='checkbox'; box.dataset.rtaWfSelect='1'; box.className='rta-wf-check'; box.title='Selecionar este item';
      box.addEventListener('change', () => renderSelection(table));
      td.prepend(box);
    });
  }

  function selected(table) { return rows(table).filter(r => r.querySelector('[data-rta-wf-select]')?.checked); }
  async function copyText(text) { await navigator.clipboard.writeText(text); }
  function flash(button, text) { const old=button.textContent; button.textContent=text; setTimeout(()=>button.textContent=old,1200); }

  function xsrf() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }
  async function api(path, opt={}) {
    if (!IS_STG) throw new Error('Ações de workflow disponíveis somente em STG.');
    const headers={Accept:'application/json, text/plain, */*',...(opt.headers||{})};
    const token=xsrf(); if(token) headers['X-XSRF-TOKEN']=token;
    const r=await fetch(API+path,{credentials:'include',...opt,headers});
    if(!r.ok){let body='';try{body=await r.text();}catch{}throw new Error(`HTTP ${r.status}${body?` - ${body.slice(0,120)}`:''}`);}
    return r;
  }
  async function loadWorkflows(force=false) {
    if (!IS_STG) { workflows=[]; workflowLoadStarted=true; schedule(); return; }
    if (workflowLoadStarted && !force) return;
    workflowLoadStarted=true;
    try {
      const r=await api('/workflows/filter?page=0&size=10000&order=asc&orderBy=name&multiOrderBy=name%3Aasc');
      const j=await r.json(); workflows=Array.isArray(j.content)?j.content:[];
    } catch(e) { console.warn('[RTA workflow seguro] Falha ao carregar workflow:',e); workflows=[]; }
    schedule();
  }
  function workflowFor(row,table){
    const name=norm(cell(row,table,'rascunho'));
    return workflows.find(w=>name&&norm(w.name)===name)||null;
  }
  function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  function confirmAction(title, items, label, fn, danger=false){
    const overlay=document.createElement('div'); overlay.className='rta-batch-overlay';
    overlay.innerHTML=`<div class="rta-batch-dialog"><header><h3>${esc(title)}</h3><button type="button" data-x>×</button></header><main><p>Confirme os itens:</p><div class="rta-batch-list">${items.map(w=>`<div><b>${esc(w.name)}</b><small>${esc(w.descriptionStatus||w.status)}${w.testerName?` · QA: ${esc(w.testerName)}`:''}</small></div>`).join('')}</div></main><footer><button type="button" data-x>Cancelar</button><button type="button" class="${danger?'danger':'primary'}" data-ok>${esc(label)} (${items.length})</button></footer></div>`;
    document.body.append(overlay); overlay.querySelectorAll('[data-x]').forEach(x=>x.onclick=()=>overlay.remove()); overlay.querySelector('[data-ok]').onclick=()=>fn(overlay);
  }
  async function runWorkflowAction(items, endpoint, overlay){
    if(actionBusy)return; actionBusy=true;
    const main=overlay.querySelector('main'),footer=overlay.querySelector('footer'); footer.innerHTML='<button disabled>Processando…</button>';
    main.innerHTML=`<p>Processando <b>0 / ${items.length}</b></p><div class="rta-batch-progress"><i></i></div><div class="rta-batch-results"></div>`;
    let ok=0,fail=0; const results=main.querySelector('.rta-batch-results');
    for(let i=0;i<items.length;i++){
      const w=items[i],line=document.createElement('div'); line.className='rta-batch-result'; line.innerHTML=`<span>⟳</span><b>${esc(w.name)}</b><small>Processando…</small>`; results.append(line);
      try{await api(`${endpoint}/${w.id}`,{method:'PUT'});ok++;line.classList.add('success');line.querySelector('span').textContent='✓';line.querySelector('small').textContent='Concluído';}
      catch(e){fail++;line.classList.add('error');line.querySelector('span').textContent='✕';line.querySelector('small').textContent=e.message;}
      main.querySelector('p').innerHTML=`Processando <b>${i+1} / ${items.length}</b>`;main.querySelector('.rta-batch-progress i').style.width=`${(i+1)/items.length*100}%`;
    }
    actionBusy=false; await loadWorkflows(true);
    main.insertAdjacentHTML('afterbegin',`<div class="rta-batch-finish"><strong>${ok} concluído${ok===1?'':'s'}</strong><span>${fail} com erro</span></div>`);
    footer.innerHTML='<button class="primary" data-done>Fechar e atualizar lista</button>';footer.querySelector('[data-done]').onclick=()=>{overlay.remove();location.reload();};
  }

  function confirmReprove(items){
    const overlay=document.createElement('div'); overlay.className='rta-batch-overlay';
    overlay.innerHTML=`<div class="rta-batch-dialog"><header><h3>Reprovar para Rascunhos</h3><button type="button" data-x>×</button></header><main><label class="rta-batch-field"><b>Justificativa</b><textarea data-j placeholder="Informe a justificativa da reprovação"></textarea></label><p>Os itens abaixo voltarão para <b>Rascunhos</b>:</p><div class="rta-batch-list">${items.map(w=>`<div><b>${esc(w.name)}</b><small>${esc(w.descriptionStatus||w.status)}${w.testerName?` · QA: ${esc(w.testerName)}`:''}</small></div>`).join('')}</div></main><footer><button type="button" data-x>Cancelar</button><button type="button" class="danger" data-ok>Reprovar (${items.length})</button></footer></div>`;
    document.body.append(overlay);
    overlay.querySelectorAll('[data-x]').forEach(x=>x.onclick=()=>overlay.remove());
    overlay.querySelector('[data-ok]').onclick=()=>{
      const justification=overlay.querySelector('[data-j]').value.trim();
      if(!justification){overlay.querySelector('[data-j]').focus();return;}
      runReproveAction(items,justification,overlay);
    };
  }

  async function runReproveAction(items,justification,overlay){
    if(actionBusy)return; actionBusy=true;
    const main=overlay.querySelector('main'),footer=overlay.querySelector('footer'); footer.innerHTML='<button disabled>Processando…</button>';
    main.innerHTML=`<p>Processando <b>0 / ${items.length}</b></p><div class="rta-batch-progress"><i></i></div><div class="rta-batch-results"></div>`;
    let ok=0,fail=0; const results=main.querySelector('.rta-batch-results');
    for(let i=0;i<items.length;i++){
      const w=items[i],line=document.createElement('div'); line.className='rta-batch-result'; line.innerHTML=`<span>⟳</span><b>${esc(w.name)}</b><small>Processando…</small>`; results.append(line);
      try{
        await api('/workflows/reprove-workflow',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetStatus:'DRAFTING',justification,id:w.id})});
        ok++;line.classList.add('success');line.querySelector('span').textContent='✓';line.querySelector('small').textContent='Enviado para Rascunhos';
      }catch(e){fail++;line.classList.add('error');line.querySelector('span').textContent='✕';line.querySelector('small').textContent=e.message;}
      main.querySelector('p').innerHTML=`Processando <b>${i+1} / ${items.length}</b>`;main.querySelector('.rta-batch-progress i').style.width=`${(i+1)/items.length*100}%`;
    }
    actionBusy=false; await loadWorkflows(true);
    main.insertAdjacentHTML('afterbegin',`<div class="rta-batch-finish"><strong>${ok} reprovado${ok===1?'':'s'}</strong><span>${fail} com erro</span></div>`);
    footer.innerHTML='<button class="primary" data-done>Fechar e atualizar lista</button>';footer.querySelector('[data-done]').onclick=()=>{overlay.remove();location.reload();};
  }
  async function nativeId(row, table) {
    const td = row.cells[col(table,'id')];
    const btn = [...(td?.querySelectorAll('button') || [])].find(b => norm(b.textContent).includes('content_copy'));
    if (!btn) return '';
    btn.click();
    await new Promise(r => setTimeout(r, 80));
    try {
      const value = clean(await navigator.clipboard.readText());
      return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : '';
    } catch { return ''; }
  }

  function ensureSelectionBar(table) {
    const frame = table.closest('.rta-table-frame') || table.parentElement;
    let bar = frame.previousElementSibling?.matches?.('[data-rta-workflow-safe-bar]') ? frame.previousElementSibling : null;
    if (!bar) {
      bar=document.createElement('div'); bar.dataset.rtaWorkflowSafeBar='1'; bar.className='rta-workflow-safe-bar'; bar.hidden=true; frame.before(bar);
    }
    return bar;
  }
  function selectionData(table) {
    const list=selected(table);
    const mapped=list.map(r=>({row:r,w:workflowFor(r,table)}));
    const assignable=IS_STG ? mapped.filter(x=>x.w?.status==='PENDING_QA_BIND').map(x=>x.w) : [];
    const unbindable=IS_STG ? mapped.filter(x=>x.w?.status==='PENDING_QA_REVIEW' && x.w?.testerName).map(x=>x.w) : [];
    const reprovable=IS_STG ? mapped.filter(x=>x.w?.status==='PENDING_QA_REVIEW').map(x=>x.w) : [];
    const unresolved=mapped.filter(x=>!x.w).length;
    return {list,mapped,assignable,unbindable,reprovable,unresolved};
  }

  function renderSelection(table) {
    const {list,mapped,assignable,unbindable,reprovable,unresolved}=selectionData(table), bar=ensureSelectionBar(table);
    bar.hidden=!list.length;
    const all=table.querySelector('[data-rta-wf-select-all]');
    if(all){ const visible=rows(table).filter(r=>r.offsetParent!==null); all.checked=!!visible.length&&visible.every(r=>r.querySelector('[data-rta-wf-select]')?.checked); all.indeterminate=list.length>0&&!all.checked; }
    if(!list.length){bar.innerHTML='';bar.dataset.rtaRenderSignature='';return;}

    // O Workflow sofre re-renderizações do React. Não recriamos os botões quando
    // a seleção real não mudou, evitando perder o click entre pointerdown/click.
    const signature=JSON.stringify(mapped.map(x=>[x.w?.id||cell(x.row,table,'rascunho'),x.w?.status||'',x.w?.testerUsername||'']));
    if(bar.dataset.rtaRenderSignature===signature) return;
    bar.dataset.rtaRenderSignature=signature;

    bar.innerHTML=`<div><strong>${list.length} selecionado${list.length===1?'':'s'}</strong><span>${assignable.length} aguardando QA · ${unbindable.length} atribuído${reprovable.length?` · ${reprovable.length} pode reprovar`:''}${unresolved?` · ${unresolved} sem ID`:''}</span></div><div class="rta-wf-safe-actions">${assignable.length?`<button type="button" class="primary" data-assign>Atribuir a mim (${assignable.length})</button>`:''}${unbindable.length?`<button type="button" class="warning" data-unbind>Desatribuir QA (${unbindable.length})</button>`:''}${reprovable.length?`<button type="button" class="danger" data-reprove>Reprovar (${reprovable.length})</button>`:''}<button type="button" data-copy-names>Copiar nomes</button><button type="button" data-copy-ids>Copiar IDs</button><button type="button" data-copy-data>Copiar dados</button><button type="button" data-clear>Limpar seleção</button></div>`;

    bar.querySelector('[data-copy-names]').onclick=async e=>{await copyText(list.map(r=>cell(r,table,'rascunho')).join('\n'));flash(e.currentTarget,'✓ Copiado');};
    bar.querySelector('[data-copy-ids]').onclick=async e=>{const ids=mapped.map(x=>x.w?.id).filter(Boolean);if(ids.length){await copyText(ids.join('\n'));flash(e.currentTarget,`✓ ${ids.length} ID${ids.length===1?'':'s'}`);}else flash(e.currentTarget,'ID não encontrado');};
    bar.querySelector('[data-copy-data]').onclick=async e=>{const parts=mapped.map(x=>`${cell(x.row,table,'rascunho')}\nID: ${x.w?.id||'(não capturado)'}\nStatus: ${x.w?.descriptionStatus||cell(x.row,table,'status')}\nCriado por: ${x.w?.user||cell(x.row,table,'criado por')}\nTester: ${x.w?.testerName||cell(x.row,table,'tester')||'-'}`);await copyText(parts.join('\n\n'));flash(e.currentTarget,'✓ Copiado');};
    bar.querySelector('[data-clear]').onclick=()=>{list.forEach(r=>r.querySelector('[data-rta-wf-select]').checked=false);renderSelection(table);};
  }

  function ensureSummary(table) {
    const frame=table.closest('.rta-table-frame')||table.parentElement;
    let summary=document.querySelector('[data-rta-workflow-summary]');
    if(!summary){summary=document.createElement('div');summary.dataset.rtaWorkflowSummary='1';summary.className='rta-workflow-summary';const bar=ensureSelectionBar(table);bar.before(summary);}
    const counts=new Map();
    rows(table).forEach(r=>{const raw=cell(r,table,'status'),k=statusKind(raw),cur=counts.get(k)||{n:0,raw};cur.n++;counts.set(k,cur);});
    const total=rows(table).length;
    const signature=JSON.stringify([total,...[...counts].map(([k,v])=>[k,v.n,v.raw])]);
    if(summary.dataset.rtaRenderSignature===signature) return;
    const active=summary.querySelector('button.is-active')?.dataset.kind||'all';
    summary.dataset.rtaRenderSignature=signature;
    summary.innerHTML=`<button type="button" data-kind="all" class="${active==='all'?'is-active':''}"><b>${total}</b><span>Todos</span></button>`+[...counts].map(([k,v])=>`<button type="button" data-kind="${k}" class="${active===k?'is-active':''}"><b>${v.n}</b><span>${statusLabel(k,v.raw)}</span></button>`).join('');
    summary.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
      const kind=btn.dataset.kind; summary.querySelectorAll('button').forEach(x=>x.classList.toggle('is-active',x===btn));
      rows(table).forEach(r=>r.classList.toggle('rta-wf-summary-hidden',kind!=='all'&&statusKind(cell(r,table,'status'))!==kind));
      renderSelection(table);
    });
  }

  async function loadDrafts() {
    if (!IS_STG) { drafts=[]; draftLoadStarted=true; return; }
    if (draftLoadStarted) return; draftLoadStarted=true;
    try { const r=await fetch(`${API}/drafts?page=0&size=100&order=asc&orderBy=name`,{credentials:'include'}); if(r.ok){const j=await r.json();drafts=Array.isArray(j.content)?j.content:[];} } catch(e){console.warn('[RTA copiar ID]',e);}
    schedule();
  }
  function draftFor(row,table){const name=norm(cell(row,table,'nome')),desc=norm(cell(row,table,'descricao'));return drafts.find(d=>desc&&norm(d.description)===desc)||drafts.find(d=>name&&norm(d.name)===name)||null;}
  function addDraftCopyIds(table){
    if(!drafts.length)return;
    rows(table).forEach(row=>{const i=col(table,'nome'),td=row.cells[i],d=draftFor(row,table);if(!td||!d||td.querySelector('[data-rta-copy-draft-id]'))return;const b=document.createElement('button');b.type='button';b.dataset.rtaCopyDraftId='1';b.className='rta-copy-draft-id';b.title=`Copiar ID: ${d.id}`;b.innerHTML='<span class="material-symbols-outlined">content_copy</span>';b.onclick=async e=>{e.stopPropagation();await copyText(d.id);b.classList.add('copied');b.title='ID copiado!';setTimeout(()=>{b.classList.remove('copied');b.title=`Copiar ID: ${d.id}`;},1200);};td.append(b);});
  }

  function mount(){
    if(!enabled){document.querySelectorAll('[data-rta-workflow-summary],[data-rta-workflow-safe-bar],[data-rta-wf-select],[data-rta-wf-select-all],[data-rta-copy-draft-id]').forEach(x=>x.remove());return;}
    const wt=workflowTable();if(wt){loadWorkflows();paintWorkflow(wt);ensureSelectors(wt);ensureSummary(wt);renderSelection(wt);}
    const dt=dashboardTable();if(dt){loadDrafts();addDraftCopyIds(dt);}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();});}
  async function loadFeature(){try{const s=await chrome.storage.local.get(FEATURE_KEY);enabled=s?.[FEATURE_KEY]?.workflowSafe!==false;}catch{}schedule();}
  window.addEventListener('rta-features-changed',e=>{enabled=e.detail?.workflowSafe!==false;schedule();});

  // Ações críticas usam delegação em capture. Assim continuam funcionando mesmo
  // se o React substituir a barra no mesmo gesto do mouse.
  document.addEventListener('click',event=>{
    const assign=event.target.closest?.('[data-rta-workflow-safe-bar] [data-assign]');
    const unbind=event.target.closest?.('[data-rta-workflow-safe-bar] [data-unbind]');
    const reprove=event.target.closest?.('[data-rta-workflow-safe-bar] [data-reprove]');
    if(!assign&&!unbind&&!reprove)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const table=workflowTable();
    if(!table||actionBusy)return;
    const data=selectionData(table);
    if(assign&&data.assignable.length){
      confirmAction('Atribuir testes a mim',data.assignable,'Atribuir a mim',o=>runWorkflowAction(data.assignable,'/workflows/bind-template-qa',o));
    } else if(unbind&&data.unbindable.length){
      confirmAction('Desatribuir QA',data.unbindable,'Desatribuir QA',o=>runWorkflowAction(data.unbindable,'/workflows/unbind-template-qa',o),true);
    } else if(reprove&&data.reprovable.length){
      confirmReprove(data.reprovable);
    }
  },true);
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadFeature,{once:true});else loadFeature();
})();
