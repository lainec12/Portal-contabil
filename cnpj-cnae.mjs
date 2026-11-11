// Consulta cadastral auxiliar. Classificação CNAE: IBGE/CONCLA.
export const normalizeCnpj = value => String(value ?? '').toUpperCase().replace(/[.\/\s-]/g, '');
export function validCnpj(value) {
  const s = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(\d)\1{13}$/.test(s)) return false;
  const digit = part => {
    let sum = 0, weight = part.length - 7;
    for (const c of part) { sum += (c.charCodeAt(0) - 48) * weight; if (--weight < 2) weight = 9; }
    const rest = sum % 11; return String(rest < 2 ? 0 : 11 - rest);
  };
  return digit(s.slice(0,12)) === s[12] && digit(s.slice(0,13)) === s[13];
}
export function prepare(values) {
  const seen = new Set(); let duplicates = 0;
  const rows = [];
  for (const value of values) {
    const id = normalizeCnpj(value);
    if (!id) continue;
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    rows.push({cnpj:id, state:validCnpj(id)?'Pendente':'Inválido', error:validCnpj(id)?'':'Formato ou dígitos verificadores inválidos'});
  }
  return {rows,duplicates};
}
const wholesale45 = new Set(['4511103','4511104','4511105','4530701','4530702','4541201','4541202']);
const representatives45 = new Set(['4512901','4530706','4542101']);
const retail45 = new Set(['4511101','4511102','4530703','4530704','4541203','4541204','4541205']);
export function classify(code) {
  const c = String(code ?? '').replace(/\D/g,'').padStart(7,'0');
  if (!/^[1-9]\d{6}$/.test(c)) return 'Não informado';
  if (c.startsWith('461') || representatives45.has(c)) return 'Representação comercial';
  if (/^46[2-9]/.test(c) || wholesale45.has(c)) return 'Atacado';
  if (c.startsWith('47') || retail45.has(c)) return 'Varejo';
  return 'Outras atividades';
}
export function company(data) {
  if (!data || !data.razao_social || !Array.isArray(data.cnaes_secundarios) || !data.cnae_fiscal)
    throw new Error('Resposta incompleta da fonte; classificação não concluída.');
  const activities = [{codigo:data.cnae_fiscal,descricao:data.cnae_fiscal_descricao,origin:'Principal'}, ...data.cnaes_secundarios.filter(a=>Number(a.codigo)).map(a=>({...a,origin:'Secundário'}))]
    .map(a=>({...a,kind:classify(a.codigo)}));
  const kinds = [...new Set(activities.map(a=>a.kind))];
  const trade = kinds.filter(k=>['Atacado','Varejo','Representação comercial'].includes(k));
  return {name:data.razao_social,status:data.descricao_situacao_cadastral||'Não informada',city:data.municipio||'',uf:data.uf||'',activities,
    wholesale:activities.some(a=>a.kind==='Atacado'),category:trade.length>1?'Mista: '+trade.join(' + '):trade[0]||'Outras atividades',
    checked:new Date().toISOString(),source:'BrasilAPI / Minha Receita'};
}
export async function lookup(id, signal, fetcher = fetch) {
  const timeout = AbortSignal.timeout(20000);
  const response = await fetcher('https://brasilapi.com.br/api/cnpj/v1/'+encodeURIComponent(id),
    {signal:signal?AbortSignal.any([signal,timeout]):timeout,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
  if (!response.ok) {
    const message = response.status===429?'Limite da fonte atingido. Aguarde antes de tentar novamente.':response.status===404?'CNPJ não localizado na fonte.':response.status>=500?'Fonte temporariamente indisponível.':'Consulta recusada pela fonte (HTTP '+response.status+').';
    const error = new Error(message); error.status = response.status; throw error;
  }
  const data = await response.json();
  if (normalizeCnpj(data.cnpj)!==id) throw new Error('A fonte retornou outro CNPJ; resposta descartada.');
  return company(data);
}
const escapeHtml = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function exportRows(rows) {
  return rows.map(r=>({'CNPJ':r.cnpj,'Consulta':r.state,'Razão social':r.name||'','Situação':r.status||'','Cidade':r.city||'','UF':r.uf||'',
    'Classificação':r.category||'Não concluída','Possui atacado':r.state==='Consultado'?(r.wholesale?'Sim':'Não'):'Não concluído',
    'CNAE principal':(r.activities||[]).filter(a=>a.origin==='Principal').map(a=>a.codigo+' — '+a.descricao+' ['+a.kind+']').join('; '),
    'CNAEs secundários':(r.activities||[]).filter(a=>a.origin==='Secundário').map(a=>a.codigo+' — '+a.descricao+' ['+a.kind+']').join('; '),
    'Consultado em (UTC)':r.checked||'','Fonte':r.source||'','Erro':r.error||'',
    'Aviso':'CNAE não comprova elegibilidade a incentivo fiscal de Goiás.'}));
}
let library;
async function xlsx() {
  if (globalThis.XLSX) return globalThis.XLSX;
  if (!library) library = new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='./vendor/xlsx.full.min.js';
    s.onload=()=>resolve(globalThis.XLSX);s.onerror=()=>{library=null;reject(new Error('Não foi possível carregar o leitor Excel.'));};document.head.append(s);
  });
  return library;
}
async function mount() {
  const host = document.getElementById('cnpj-cnae');
  if (!host) return;
  host.innerHTML = `<div class="wrap"><div class="section-head"><div><span class="kicker">Consulta cadastral</span><h2>Conferência de CNPJ e CNAE</h2><p>Confira empresas e identifique atividades de atacado no CNAE principal e nos secundários.</p></div></div>
  <div class="card"><label for="cc-input"><b>CNPJs (um por linha, separados por vírgula ou ponto e vírgula)</b></label><textarea id="cc-input" class="field" rows="5" style="width:100%" placeholder="00.000.000/0001-91"></textarea>
  <div class="grid grid-2"><div><label for="cc-file">Importar XLSX ou CSV (até 5 MB)</label><input id="cc-file" class="field" type="file" accept=".xlsx,.csv"><p class="fine">Use uma coluna chamada CNPJ, como texto, preservando zeros iniciais. Se houver várias colunas, escolha abaixo.</p></div><div id="cc-columns" hidden><label for="cc-sheet">Aba da planilha</label><select id="cc-sheet" class="field"></select><label for="cc-column">Coluna de CNPJ</label><select id="cc-column" class="field"></select><button id="cc-use" class="field">Usar coluna</button></div></div>
  <p class="fine">Até 100 CNPJs por lote, sem truncar excedentes. Consulta sequencial, intervalo mínimo de 2 segundos e timeout de 20 segundos. O provedor pode impor outros limites e ter dados defasados. Não é certidão da Receita Federal.</p>
  <label><input type="checkbox" id="cc-consent"> Autorizo enviar os CNPJs à BrasilAPI / Minha Receita para consultar dados públicos.</label>
  <p class="fine">A planilha é lida neste navegador; somente cada CNPJ válido é enviado à fonte. Resultados ficam em memória nesta aba e não são salvos pelo módulo. O provedor recebe o CNPJ e o IP da conexão. Use Limpar ao terminar; arquivos exportados permanecem no seu aparelho.</p>
  <div class="button-row"><button id="cc-validate" class="field">Validar e remover duplicatas</button><button id="cc-run" class="primary">Consultar CNPJs</button><button id="cc-stop" class="field" disabled>Interromper</button><button id="cc-clear" class="field">Limpar</button><button id="cc-export" class="field">Exportar Excel (filtro atual)</button></div>
  <p id="cc-progress" role="status" aria-live="polite">Aguardando CNPJs.</p>
  <div class="notice"><b>Análise cadastral, sem conclusão fiscal:</b> possuir CNAE atacadista não comprova elegibilidade a incentivo fiscal em Goiás. Confira os requisitos legais e a operação efetiva.</div>
  <p class="fine">Critério: divisão 46, excluído o grupo 46.1 (representantes); divisão 47 para varejo e subclasses específicas da divisão 45 para veículos. Atividades mistas aparecem separadas. Ausência de atacado significa apenas ausência nos CNAEs retornados. <a href="https://concla.ibge.gov.br/busca-online-cnae.html" target="_blank" rel="noopener">Tabela IBGE/CONCLA</a> · <a href="https://brasilapi.com.br/docs" target="_blank" rel="noopener">Fonte e documentação</a></p></div>
  <div class="questions-toolbar"><label>Atividade <select id="cc-filter" class="field"><option value="">Todas</option><option value="Atacado">Com atacado</option><option value="Varejo">Com varejo</option><option value="Representação comercial">Com representação comercial</option><option value="none">Sem atacado (consultados)</option><option value="error">Erros / inválidos / pendentes</option></select></label><label>Situação <input id="cc-status" class="field" placeholder="Ex.: ATIVA"></label><label>Buscar <input id="cc-search" class="field" placeholder="CNPJ, razão social, cidade ou UF"></label></div>
  <div class="table-scroll" style="overflow:auto;max-height:650px"><table class="tax-table"><thead><tr><th>CNPJ</th><th>Empresa / situação</th><th>Cidade/UF</th><th>Classificação</th><th>CNAEs principal e secundários</th><th>Consulta / fonte</th></tr></thead><tbody id="cc-rows"></tbody></table></div></div>`;
  const $=id=>host.querySelector('#cc-'+id);
  let rows=[],book=null,controller=null,busy=false,duplicates=0,lastRequest=0;
  const note=text=>{$('progress').textContent=text;};
  function visible() {
    const f=$('filter').value,q=$('search').value.toLocaleLowerCase(),s=$('status').value.toLocaleLowerCase();
    return rows.filter(r=>(!f||(f==='error'?r.state!=='Consultado':f==='none'?r.state==='Consultado'&&!r.wholesale:r.activities?.some(a=>a.kind===f)))&&
      (!s||(r.status||'').toLocaleLowerCase().includes(s))&&(!q||[r.cnpj,r.name,r.city,r.uf].join(' ').toLocaleLowerCase().includes(q)));
  }
  function render() {
    const list=visible();
    $('rows').innerHTML=list.length?list.map(r=>`<tr><td>${escapeHtml(r.cnpj)}</td><td>${escapeHtml(r.name||'—')}<br>${escapeHtml(r.status||'')}</td><td>${escapeHtml([r.city,r.uf].filter(Boolean).join('/'))}</td><td>${escapeHtml(r.category||'Não concluída')}</td><td>${(r.activities||[]).map(a=>escapeHtml(a.origin+': '+a.codigo+' — '+a.descricao+' ['+a.kind+']')).join('<br>')}</td><td>${escapeHtml(r.state)}<br>${escapeHtml(r.error||'')}<br>${escapeHtml(r.checked||'')}<br>${escapeHtml(r.source||'')}</td></tr>`).join(''):'<tr><td colspan="6">Nenhum resultado neste filtro.</td></tr>';
  }
  function lock(value) {
    busy=value;
    for(const id of ['input','file','sheet','column','use','validate','run','clear']) $(id).disabled=value;
    $('stop').disabled=!value;
  }
  function validate() {
    const result=prepare($('input').value.split(/[\n\r;,\t]+/));
    if(result.rows.length>100) throw new Error('O lote tem '+result.rows.length+' CNPJs únicos. Divida em lotes de até 100; nenhum foi consultado.');
    rows=result.rows;duplicates=result.duplicates;render();
    note(rows.length+' únicos; '+duplicates+' duplicatas removidas; '+rows.filter(r=>r.state==='Inválido').length+' inválidos.');
  }
  $('validate').onclick=()=>{try{validate();}catch(e){note(e.message);}};
  $('run').onclick=async()=>{
    if(busy)return;
    try {validate();if(!rows.length)throw new Error('Informe os CNPJs.');if(!$('consent').checked)throw new Error('Autorize a consulta à fonte para continuar.');}catch(e){note(e.message);return;}
    controller=new AbortController();const signal=controller.signal;lock(true);
    try {
      for(const r of rows.filter(r=>r.state==='Pendente')) {
        if(signal.aborted)break;
        const delay=Math.max(0,2000-(Date.now()-lastRequest));
        if(delay)await new Promise(resolve=>{const t=setTimeout(resolve,delay);signal.addEventListener('abort',()=>{clearTimeout(t);resolve();},{once:true});});
        if(signal.aborted)break;
        r.state='Consultando';render();lastRequest=Date.now();
        try {Object.assign(r,await lookup(r.cnpj,signal),{state:'Consultado',error:''});}
        catch(e){r.state=signal.aborted?'Pendente':'Erro';r.error=signal.aborted?'Consulta interrompida.':e.name==='TimeoutError'?'Tempo de consulta esgotado.':e.message||'Falha de conexão ou bloqueio do navegador.';if(e.status===429){note(e.message);controller.abort();}}
        render();note(rows.filter(x=>['Consultado','Erro','Inválido'].includes(x.state)).length+'/'+rows.length+' processados; '+duplicates+' duplicatas removidas.');
      }
    } finally {lock(false);note((signal.aborted?'Interrompido. ':'Concluído. ')+rows.filter(r=>r.state==='Consultado').length+' consultados; '+rows.filter(r=>r.state==='Erro').length+' erros; '+rows.filter(r=>r.state==='Pendente').length+' pendentes; '+rows.filter(r=>r.state==='Inválido').length+' inválidos.');controller=null;}
  };
  $('stop').onclick=()=>controller?.abort();
  $('clear').onclick=()=>{rows=[];book=null;$('input').value='';$('file').value='';$('consent').checked=false;$('columns').hidden=true;render();note('Dados removidos da memória desta ferramenta.');};
  for(const id of ['filter','status','search'])$(id).oninput=render;
  function columns() {
    const sheet=book.Sheets[$('sheet').value],lib=globalThis.XLSX;
    const data=lib.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
    const width=Math.max(0,...data.slice(0,30).map(r=>r.length));
    $('column').innerHTML=Array.from({length:width},(_,i)=>'<option value="'+i+'">'+escapeHtml(lib.utils.encode_col(i)+' — '+(data[0]?.[i]||'sem cabeçalho'))+'</option>').join('');
    const index=(data[0]||[]).findIndex(c=>String(c).toUpperCase().includes('CNPJ'));
    if(index>=0)$('column').value=String(index);
  }
  $('sheet').onchange=columns;
  $('file').onchange=async()=>{
    const file=$('file').files[0];if(!file)return;
    try{
      if(file.size>5*1024*1024)throw new Error('Arquivo excede 5 MB.');
      if(!/\.(xlsx|csv)$/i.test(file.name))throw new Error('Escolha XLSX ou CSV.');
      const lib=await xlsx();
      const data=/\.csv$/i.test(file.name)?await file.text():await file.arrayBuffer();
      book=lib.read(data,{type:typeof data==='string'?'string':'array',raw:true});
      $('sheet').innerHTML=book.SheetNames.map(n=>'<option>'+escapeHtml(n)+'</option>').join('');
      $('columns').hidden=false;columns();note('Selecione a aba e a coluna e clique em Usar coluna.');
    }catch(e){book=null;$('columns').hidden=true;note(e.message);}
  };
  $('use').onclick=()=>{
    if(!book)return;
    const data=globalThis.XLSX.utils.sheet_to_json(book.Sheets[$('sheet').value],{header:1,defval:'',raw:false});
    const col=Number($('column').value);
    const values=data.map(r=>String(r[col]??''));
    if(/cnpj/i.test(values[0]||''))values.shift();
    $('input').value=values.join('\n');try{validate();}catch(e){note(e.message);}
  };
  $('export').onclick=async()=>{
    try{const list=visible();if(!list.length)throw new Error('Não há resultados para exportar.');
      const lib=await xlsx(),ws=lib.utils.json_to_sheet(exportRows(list));ws['!cols']=[{wch:20},{wch:15},{wch:40},{wch:18},{wch:25},{wch:5},{wch:35},{wch:20},{wch:60},{wch:100}];
      const wb=lib.utils.book_new();lib.utils.book_append_sheet(wb,ws,'Conferência CNPJ');lib.writeFile(wb,'conferencia-cnpj-cnae.xlsx');
    }catch(e){note(e.message);}
  };
  render();
}
if(typeof document!=='undefined')mount().catch(console.error);
