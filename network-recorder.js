(() => {
  if (window.__RTA_NETWORK_RECORDER_UI__) return;
  window.__RTA_NETWORK_RECORDER_UI__ = true;
  const entries = new Map();
  let recording = false;
  let panel, list, status, count, nameInput;
  const SECRET = /(authorization|cookie|set-cookie|x-api-key|api[-_]?key|password|senha|access[-_]?token|refresh[-_]?token|client[-_]?secret)/i;
  const mask = (value, key='') => {
    if (SECRET.test(key)) return '[REMOVIDO]';
    if (Array.isArray(value)) return value.map(v => mask(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, mask(v,k)]));
    if (typeof value === 'string') {
      let parsed; try { parsed=JSON.parse(value); return JSON.stringify(mask(parsed), null, 2); } catch (_) {}
      return value.replace(/((?:password|senha|access_token|refresh_token|client_secret|authorization|api[_-]?key)\s*[=:]\s*)[^&\s",}]+/gi, '$1[REMOVIDO]');
    }
    return value;
  };
  const safeEntry = e => ({...e, requestHeaders:mask(e.requestHeaders), requestBody:mask(e.requestBody), responseHeaders:mask(e.responseHeaders), responseBody:mask(e.responseBody)});
  const esc = s => String(s ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function render() {
    if (!list) return;
    const arr=[...entries.values()];
    count.textContent=arr.length;
    status.textContent=recording?'● Gravando':'● Parado';
    status.classList.toggle('is-recording', recording);
    list.innerHTML=arr.slice().reverse().map(e=>`<button class="rta-net-row" data-id="${e.id}"><b>${esc(e.method)}</b><span class="rta-net-code ${e.status>=400?'bad':''}">${e.status || '...'}</span><span title="${esc(e.url)}">${esc((()=>{try{return new URL(e.url).pathname}catch(_){return e.url}})())}</span><small>${e.durationMs!=null?e.durationMs+' ms':''}</small></button>`).join('') || '<div class="rta-net-empty">Nenhuma requisição capturada.</div>';
  }
  function exportData(copy=false) {
    const data={ name:nameInput?.value?.trim() || 'Captura de rede', capturedAt:new Date().toISOString(), page:location.href, requests:[...entries.values()].map(safeEntry) };
    const text=JSON.stringify(data,null,2);
    if(copy) navigator.clipboard.writeText(text).then(()=>alert('Captura sanitizada copiada para a área de transferência.'));
    else { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/json'})); a.download='rta-network-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  }
  function showDetails(id) {
    const e=safeEntry(entries.get(Number(id))); if(!e) return;
    const pre=panel.querySelector('.rta-net-detail'); pre.hidden=false; pre.textContent=JSON.stringify(e,null,2);
  }
  function mount() {
    if (document.querySelector('[data-rta-network-recorder]')) return;
    const root=document.createElement('div'); root.dataset.rtaNetworkRecorder='true';
    root.innerHTML=`<button class="rta-net-fab" title="Capturador de Rede"><span class="material-symbols-outlined">network_check</span><span>Rede</span></button>
    <section class="rta-net-panel" hidden><header><strong>Capturador de Rede</strong><button data-close>×</button></header>
    <label class="rta-net-name">Nome da gravação<input placeholder="Ex.: Enviar para Code Review"></label>
    <div class="rta-net-summary"><span class="rta-net-status">● Parado</span><span><b class="rta-net-count">0</b> requisições</span></div>
    <div class="rta-net-list"></div><pre class="rta-net-detail" hidden></pre>
    <footer><button data-clear>Limpar</button><button data-copy>Copiar para IA</button><button data-export>Exportar JSON</button><button class="rta-net-primary" data-toggle>Iniciar</button></footer></section>`;
    document.body.append(root);
    panel=root.querySelector('.rta-net-panel'); list=root.querySelector('.rta-net-list'); status=root.querySelector('.rta-net-status'); count=root.querySelector('.rta-net-count'); nameInput=root.querySelector('input');
    root.querySelector('.rta-net-fab').onclick=()=>panel.hidden=!panel.hidden;
    root.querySelector('[data-close]').onclick=()=>panel.hidden=true;
    root.querySelector('[data-toggle]').onclick=e=>{ recording=!recording; e.currentTarget.textContent=recording?'Parar':'Iniciar'; window.postMessage({source:'rta-network-recorder-ui',action:recording?'start':'stop'},'*'); render(); };
    root.querySelector('[data-clear]').onclick=()=>{ entries.clear(); root.querySelector('.rta-net-detail').hidden=true; render(); };
    root.querySelector('[data-copy]').onclick=()=>exportData(true);
    root.querySelector('[data-export]').onclick=()=>exportData(false);
    list.onclick=e=>{ const row=e.target.closest('[data-id]'); if(row) showDetails(row.dataset.id); };
    render();
  }
  window.addEventListener('message', event => {
    if(event.source!==window || event.data?.source!=='rta-network-recorder-page') return;
    if(event.data.action==='request') entries.set(event.data.entry.id,event.data.entry);
    if(event.data.action==='response' && entries.has(event.data.id)) Object.assign(entries.get(event.data.id),event.data.patch);
    render();
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})();