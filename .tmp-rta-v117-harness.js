const http = require('http');
const fs = require('fs');

const dashboard = fs.readFileSync('C:/Users/LeonardoSabatini/.codex/attachments/65762358-f7cd-4871-8749-b418fe0e97a4/pasted-text.txt', 'utf8');
const executions = fs.readFileSync('C:/Users/LeonardoSabatini/.codex/attachments/e02de0f2-3641-4540-9fe9-637a998fd3e1/pasted-text.txt', 'utf8');
const enhancer = fs.readFileSync('table-enhancer.js', 'utf8');
const enhancerCss = fs.readFileSync('table-enhancer.css', 'utf8');
const bridge = fs.readFileSync('page-bridge.js', 'utf8');
const pagination = fs.readFileSync('pagination.js', 'utf8');
const chromeStub = value => `<script>chrome={storage:{local:{get:async()=>(${JSON.stringify(value)}),set:()=>{}}}};</script>`;

function dashboardPage() {
  return `<!doctype html><html><head><style>${enhancerCss}</style></head><body><div id="card"><div id="toolbar"><button id="export"><span class="material-symbols-outlined">download</span> EXPORTAR TUDO</button></div>${dashboard}</div>${chromeStub({})}<script>${enhancer}</script><script>setTimeout(()=>{const panel=document.querySelector('.rta-table-filters'),exp=document.querySelector('#export');document.body.dataset.filterBesideExport=String(exp?.nextElementSibling===panel);},600);</script></body></html>`;
}

function executionPage() {
  const setup = `<script>
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>document.body.dataset.copied=value}});
    window.open=()=>{document.body.dataset.nativeOpen='true';return null};
    document.addEventListener('click',event=>{
      if(!event.target.closest?.('button[aria-haspopup="menu"]'))return;
      const item=document.createElement('button');item.setAttribute('role','menuitem');item.textContent='Inspecionar requisição';
      item.onclick=()=>window.open('/dootax/request-inspector','_blank');document.body.append(item);
    });
  </script>`;
  return `<!doctype html><html><body>${executions}${chromeStub({})}${setup}<script>${bridge}</script><script>${enhancer}</script><script>setTimeout(()=>document.querySelector('[data-rta-copy-urls]')?.click(),400);setTimeout(()=>{document.body.dataset.batchButton=String(Boolean(document.querySelector('[data-rta-copy-urls]')));},5000);</script></body></html>`;
}

function paginationPage() {
  const saved = { rtaPageSizeByPageV1: { 'http://127.0.0.1:8135/dootax/paging': 'all' } };
  const setup = `<script>
    const native=document.querySelector('#native');
    native.onclick=()=>{document.querySelectorAll('[role="option"]').forEach(x=>x.remove());[5,10,15,25].forEach(size=>{const option=document.createElement('button');option.setAttribute('role','option');option.textContent=size+' / página';option.onclick=()=>{native.querySelector('span').textContent=size+' / página';document.querySelectorAll('[role="option"]').forEach(x=>x.remove())};document.body.append(option)})};
    window.addEventListener('message',event=>{if(event.data?.source==='rta-page-size'){document.body.dataset.requestedSize=String(event.data.size);window.postMessage({source:'rta-page-size-page',token:event.data.token},'*')}});
  </script>`;
  return `<!doctype html><html><body><div class="footer"><div class="items-center"><button id="native" role="combobox"><span>25 / página</span></button></div><span>1-25 de 54</span></div><script>window.onerror=(message,source,line,column,error)=>document.body.dataset.scriptError=[message,line,column,error?.stack].filter(Boolean).join(' | ');window.onunhandledrejection=event=>document.body.dataset.rejection=String(event.reason?.stack||event.reason);</script>${chromeStub(saved)}${setup}<script>${pagination}</script><script>setTimeout(()=>{const select=document.querySelector('.rta-page-size-select');document.body.dataset.pageValue=select?.value||'';document.body.dataset.activeSize=select?.dataset.activeSize||'';document.body.dataset.nativeEnhanced=document.querySelector('#native')?.dataset.rtaPageSize||'';},1800);</script></body></html>`;
}

http.createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  if (request.url.startsWith('/dootax/request-inspector')) return response.end('<!doctype html><html><body><main><h1>Inspecionar requisição</h1><label>URL<input aria-label="URL" value="https://api.example.test/request/123"></label></main></body></html>');
  if (request.url.startsWith('/dootax/execution')) return response.end(executionPage());
  if (request.url.startsWith('/dootax/paging')) return response.end(paginationPage());
  response.end(dashboardPage());
}).listen(8135, '127.0.0.1', () => console.log('ready'));
