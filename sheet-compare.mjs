// C100/C170 import: vl_doc belongs to the document and must never be summed per item.
// COD_SIT reference: https://sped.rfb.gov.br/arquivo/download/8112
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const digits=x=>String(x??'').replace(/\D/g,'');
const cleanId=x=>String(x??'').trim().replace(/^'/,'').replace(/^0+(?=\d)/,'');
const required=['num_doc','vl_doc','ind_oper','cod_sit'];
const cancelCodes=new Set(['02','03']),excludedCodes=new Set(['02','03','04','05']);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>c===null||c===undefined?'—':(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const movement=x=>x==='entrada'?'Entrada':'Saída';
const compareWarning='diferença pode estar nas notas canceladas, favor confira';

export function parseDelimited(text){
  const first=text.replace(/^\uFEFF/,'').split(/\r?\n/).find(x=>x.trim())||'';
  const sep=[';','\t',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}
    else if(!quoted&&c===sep){row.push(cell);cell=''}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV com aspas sem fechamento. Exporte novamente o relatório.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
export function cents(value){
  if(typeof value==='number'){if(!Number.isFinite(value))return null;return Math.round(value*100)}
  let s=String(value??'').trim().replace(/R\$|\s/g,'');if(!s)return null;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  if(!/^-?\d+(?:\.\d{1,5})?$/.test(s))return null;
  const n=Math.round(Number(s)*100);return Number.isSafeInteger(n)?n:null;
}
function dateValue(value){
  if(typeof value==='number'&&value>0&&value<100000){return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10)}
  const s=String(value??'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m){m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(m)m=[m[0],m[3],m[2],m[1]]}
  if(!m)return '';
  const iso=`${m[1]}-${m[2]}-${m[3]}`,d=new Date(iso+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===iso?iso:'';
}
function referenceMonth(value){
  const s=norm(value);let m=s.match(/^(\d{4})-(\d{2})(?:$|-)/);if(m&&+m[2]>=1&&+m[2]<=12)return `${m[1]}-${m[2]}`;
  m=s.match(/^(\d{2})\/(\d{4})$/);if(m&&+m[1]>=1&&+m[1]<=12)return `${m[2]}-${m[1]}`;
  const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  m=s.match(/^([a-z]+)\s+(?:de\s+)?(\d{4})$/);const idx=m?months.indexOf(m[1]):-1;return idx>=0?`${m[2]}-${String(idx+1).padStart(2,'0')}`:'';
}
export function normalizeReport(rows,{basis='reference',name='Planilha'}={}){
  const headerAt=rows.findIndex(r=>required.every(k=>r.map(norm).includes(k)));
  if(headerAt<0)throw new Error('Modelo não reconhecido. São necessárias as colunas num_doc, vl_doc, ind_oper e cod_sit do relatório C100/C170.');
  const headers=rows[headerAt].map(norm),get=(row,k)=>row[headers.indexOf(k)]??'',notes=new Map(),companies=new Set();let sourceRows=0;
  for(let i=headerAt+1;i<rows.length;i++){
    const row=rows[i];if(row.every(x=>!String(x??'').trim()))continue;sourceRows++;
    const fail=message=>{throw new Error(`${name}, linha ${i+1}: ${message}`)};
    const num=cleanId(get(row,'num_doc'));if(!num)fail('número da nota vazio.');
    const op=String(get(row,'ind_oper')).trim();if(!['0','1'].includes(op))fail('ind_oper deve ser 0 (entrada) ou 1 (saída).');
    const direction=op==='0'?'entrada':'saida',sit=String(get(row,'cod_sit')).trim().padStart(2,'0');
    if(!/^(00|01|02|03|04|05|06|07|08)$/.test(sit))fail('cod_sit não reconhecido.');
    const rawKey=String(get(row,'chv_nfe')).trim().replace(/^'/,'');
    if(rawKey&&!/^\d{44}$/.test(rawKey))fail('chave de acesso incompleta ou convertida em número pelo Excel. Exporte a chave como texto.');
    const key=rawKey,participant=digits(get(row,'cnpj')||get(row,'cpf')),series=cleanId(get(row,'ser')),model=cleanId(get(row,'cod_mod'));
    const docDate=dateValue(get(row,'dt_doc')),entryDate=dateValue(get(row,'dt_e_s'));
    const period=basis==='emission'?docDate.slice(0,7):basis==='entry'?entryDate.slice(0,7):referenceMonth(get(row,'mesreferencia'))||entryDate.slice(0,7)||docDate.slice(0,7);
    if(!period)fail('competência ou data ausente para o critério escolhido.');
    let amount=cents(get(row,'vl_doc'));if(amount===null){if(excludedCodes.has(sit)&&!String(get(row,'vl_doc')).trim())amount=0;else fail('vl_doc vazio ou inválido.')}
    if(!key&&!participant)fail('nota sem chave de acesso e sem CPF/CNPJ da contraparte para identificar o documento.');
    const id=key?`${direction}|${key}`:`${direction}|${period}|${model}|${series}|${num}|${participant}`;
    const old=notes.get(id);
    if(old){if(old.amount!==amount||old.sit!==sit||old.period!==period||old.num!==num)fail('há valores, situação ou competência conflitantes para a mesma nota.');if(old.ownEntryEmission!==(String(get(row,'ind_emit')).trim()==='0'&&direction==='entrada'))fail('indicador de emissão conflitante para a mesma nota.');old.itemRows++;old.cfops=[...new Set([...old.cfops,String(get(row,'cfop')).replace(/\D/g,'')].filter(Boolean))];continue}
    const ownEmission=String(get(row,'ind_emit')).trim()==='0';if(key&&ownEmission)companies.add(key.slice(6,20));
    notes.set(id,{id,key,num,series,model,participant,partner:String(get(row,'nome_part')),date:docDate,entryDate,period,direction,amount,sit,cancelled:cancelCodes.has(sit),excluded:excludedCodes.has(sit),ownEntryEmission:ownEmission&&direction==='entrada',itemRows:1,cfops:[String(get(row,'cfop')).replace(/\D/g,'')].filter(Boolean)});
  }
  if(!notes.size)throw new Error('A planilha não contém notas para comparar.');
  return {name,notes:[...notes.values()],sourceRows,companies:[...companies]};
}
export function hasOutputEntryCfop(n){return !!n&&n.direction==='saida'&&(n.cfops||[]).some(c=>/^[123]\d{3}$/.test(String(c).replace(/\D/g,'')))}
function fallbackId(n){return [n.direction,n.model,n.series,n.num,n.participant].map(cleanId).join('|')}
export function fromXml(records,ownCnpj){
  const notes=new Map();let outside=0;
  for(const n of records){
    let direction=n.emitId===ownCnpj?'saida':n.destId===ownCnpj?'entrada':'';if(!direction){outside++;continue}
    const id=n.key?`${direction}|${n.key}`:`${direction}|${n.name}`;
    const cancelled=!!n.cancelEvents?.length||['101','151','155'].includes(String(n.cStat))||/^CANCELADA\b/i.test(n.status||'');
    const amount=cents(Number(n.total));if(amount===null)throw new Error('XML com valor inválido: '+(n.nfe||n.name));
    const note={ownEntryEmission:n.emitId===ownCnpj&&n.tpNF==='0',cfops:[...String(n.cfops||'').split(/[,;\s]+/),...(n.cfopRows||[]).map(r=>r.cfop)].map(c=>String(c).replace(/\D/g,'')),id,key:n.key||'',num:cleanId(n.nfe),series:cleanId(n.serie),model:cleanId(n.model==='NFC-e'?'65':'55'),participant:direction==='entrada'?n.emitId:n.destId,partner:direction==='entrada'?n.emit:n.dest,date:n.emissao?.slice(0,10)||'',period:n.competencia,direction,amount,cancelled,excluded:cancelled||['110','301','302'].includes(String(n.cStat)),sit:cancelled?'Cancelada':n.status||'Não informado'};
    const old=notes.get(id);if(old&&old.amount!==note.amount)throw new Error('XMLs com a mesma chave e valores conflitantes.');
    if(!old)notes.set(id,note);else if(cancelled){old.cancelled=true;old.excluded=true}
  }
  if(!notes.size)throw new Error('Não há NF-e/NFC-e do CNPJ informado nos XMLs conferidos.');
  return {name:'XMLs conferidos',notes:[...notes.values()],sourceRows:records.length,companies:[ownCnpj],outside};
}
export function reconcile(a,b){
  const byKey=new Map(),byFallback=new Map(),used=new Set();
  for(const n of b.notes){if(n.key){const k=n.direction+'|'+n.key;byKey.set(k,[...(byKey.get(k)||[]),n])}const k=fallbackId(n);byFallback.set(k,[...(byFallback.get(k)||[]),n])}
  const leftCounts=new Map();for(const n of a.notes){const k=fallbackId(n);leftCounts.set(k,(leftCounts.get(k)||0)+1)}
  const rows=[];
  for(const left of a.notes){
    let candidates=left.key?(byKey.get(left.direction+'|'+left.key)||[]):[];let fallback=false;
    if(!candidates.length){candidates=(byFallback.get(fallbackId(left))||[]).filter(n=>!left.key||!n.key);fallback=true}
    candidates=candidates.filter(n=>!used.has(n));let right=null,ambiguous=candidates.length>1||(fallback&&candidates.length>0&&leftCounts.get(fallbackId(left))>1);
    if(!ambiguous&&candidates.length===1){right=candidates[0];used.add(right)}
    const issues=[];if(ambiguous)issues.push('Correspondência ambígua; conferir manualmente');
    else if(!right)issues.push('Somente na planilha A');
    else{
      if(left.amount!==right.amount)issues.push('Valor diferente');
      if(left.cancelled!==right.cancelled||left.excluded!==right.excluded)issues.push('Situação diferente');
      if(left.period!==right.period)issues.push('Competência diferente');
      if(left.date&&right.date&&left.date!==right.date)issues.push('Data de emissão diferente');
    }
    if(hasOutputEntryCfop(left)||hasOutputEntryCfop(right))issues.push('Nota na saída com CFOP de entrada — verificar movimento');
    rows.push({left,right,issues,fallback:!!right&&fallback,difference:right?right.amount-left.amount:null});
  }
  for(const right of b.notes)if(!used.has(right))rows.push({left:null,right,issues:['Somente na outra fonte',...(hasOutputEntryCfop(right)?['Nota na saída com CFOP de entrada — verificar movimento']:[])],difference:null});
  return rows;
}
export function monthly(notes){
  const groups=new Map();
  for(const note of notes){const k=note.period+'|'+note.direction;let g=groups.get(k);if(!g){g={period:note.period,direction:note.direction,amount:0,raw:0,cancelled:0,count:0};groups.set(k,g)}g.raw+=note.amount;if(note.cancelled)g.cancelled+=note.amount;if(!note.excluded){g.amount+=note.amount;g.count++}}
  return groups;
}
export function compareMonthly(a,b){
  const left=monthly(a.notes),right=b.totals?new Map(b.totals.map(t=>[t.period+'|'+t.direction,t])):monthly(b.notes);
  return [...new Set([...left.keys(),...right.keys()])].sort().map(k=>{const l=left.get(k),r=right.get(k);return {period:(l||r).period,direction:(l||r).direction,left:l||null,right:r||null,difference:l&&r?r.amount-l.amount:null}});
}
let xlsxPromise;
async function xlsx(){
  if(globalThis.XLSX)return globalThis.XLSX;
  if(!xlsxPromise)xlsxPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/xlsx.full.min.js';script.onload=()=>globalThis.XLSX?resolve(globalThis.XLSX):reject(new Error('Leitor Excel indisponível.'));script.onerror=()=>{xlsxPromise=null;reject(new Error('Não foi possível carregar o leitor Excel. Use CSV ou tente novamente.'))};document.head.append(script)});
  return xlsxPromise;
}
async function readReport(file,basis){
  if(!file)throw new Error('Selecione a planilha do relatório C100/C170.');
  if(file.size>30*1024*1024)throw new Error('A planilha excede 30 MB. Exporte um período menor.');
  const bytes=await file.arrayBuffer();let rows,sheet='';
  if(/\.(csv|tsv|txt)$/i.test(file.name)){
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{text=new TextDecoder('windows-1252').decode(bytes)}rows=parseDelimited(text);
  }else if(/\.(xlsx|xls)$/i.test(file.name)){
    const lib=await xlsx(),book=lib.read(bytes,{type:'array',cellDates:false,dateNF:'yyyy-mm-dd'});
    const matches=book.SheetNames.map(name=>({name,rows:lib.utils.sheet_to_json(book.Sheets[name],{header:1,raw:true,defval:''})})).filter(s=>s.rows.some(r=>required.every(k=>r.map(norm).includes(k))));
    if(matches.length!==1)throw new Error(matches.length?'Há mais de uma aba de relatório. Salve a aba desejada em CSV para comparar.':'Nenhuma aba com o cabeçalho C100/C170 foi encontrada.');
    rows=matches[0].rows;sheet=matches[0].name;
  }else throw new Error('Formato não aceito. Use CSV, XLSX ou XLS.');
  return {...normalizeReport(rows,{basis,name:file.name}),sheet};
}
function filtered(source,period,direction){return {...source,notes:source.notes?.filter(n=>(!period||n.period===period)&&(!direction||n.direction===direction)),totals:source.totals?.filter(n=>(!period||n.period===period)&&(!direction||n.direction===direction))}}
function neutralizeCsv(x){const text=String(x??'');return '"'+(/^[=+@\t\r]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"'}
function download(text,name,type){const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function noteDescription(n){return n?`${esc(n.num)} · série ${esc(n.series||'—')}<br><small>${esc(n.partner||n.participant||'')}</small>${n.key?`<details><summary>Ver chave</summary><small>${esc(n.key)}</small></details>`:'<br><small>Sem chave informada</small>'}`:'—'}
function noteState(n){return n?n.cancelled?'Cancelada':n.excluded?'Denegada / inutilizada':esc(n.sit):'—'}
function cfopClueForMonth(row,a,b){
  if(row.difference===null||Math.abs(row.difference)<=1)return '';
  const source=row.difference>0&&b.notes?b:a;
  const docs=(source.notes||[]).filter(n=>n.period===row.period&&n.direction===row.direction&&!n.excluded).map(n=>({included:true,note:{key:n.key||n.id,name:n.id,total:n.amount/100,cfops:(n.cfops||[]).join(', ')}}));
  return globalThis.portalSheetBridge?.cfopDifferenceLabel(docs,row.difference/100)||'';
}
function ownEntryForMonth(row,a,b){
  const notes=[...(a.notes||[]),...(b.notes||[])].filter(n=>n.period===row.period&&n.ownEntryEmission&&!n.excluded);
  const docs=notes.map(n=>({included:true,note:{key:n.key||n.id,name:n.id,total:n.amount/100,ownEntryEmission:true,original:n}}));
  return globalThis.portalSheetBridge?.ownEntryMatch(docs,row.difference===null?null:row.difference/100)||{notes:[],matched:[]};
}
function outputEntryCfopSheetHtml(a,b){
  const found=new Map();
  for(const n of [...(a.notes||[]),...(b.notes||[])]){if(!n.excluded&&hasOutputEntryCfop(n))found.set(n.key||n.id,n)}
  const notes=[...found.values()];if(!notes.length)return '';
  return `<div class="notice" style="margin:10px 0;border-left:4px solid #bb86ed;padding:12px"><b>Nota(s) na saída com CFOP de entrada — verificar movimento.</b><details><summary>Ver notas destacadas (${notes.length})</summary>${notes.map(n=>`<div style="padding:8px;margin:8px 0;border-left:4px solid #bb86ed"><b>NF-e nº ${esc(n.num)} · série ${esc(n.series||'—')} · ${money(n.amount)}</b><br>CFOP de entrada: ${esc(n.cfops.filter(c=>/^[123]\d{3}$/.test(c)).join(', '))}${n.key?`<details><summary>Ver chave</summary>${esc(n.key)}</details>`:''}</div>`).join('')}</details></div>`;
}
function ownEntrySheetHtml(months){
  return months.filter(r=>(r.difference===null||Math.abs(r.difference)>1)&&r.ownEntry?.notes.length).map(r=>{
    const matched=new Set(r.ownEntry.matched.map(d=>d.note.key||d.note.name));
    return `<div class="notice" style="margin:10px 0;border-left:4px solid #bb86ed;padding:12px"><b>${esc(r.period)} · Notas de entrada de emissão própria podem estar totalizadas no Livro como entrada.</b>${matched.size?`<p><b>Valor faltante bate com nota(s) de entrada de emissão própria: ${money(Math.abs(r.difference))}.</b></p>`:''}<details${matched.size?' open':''}><summary>Ver notas destacadas (${r.ownEntry.notes.length})</summary>${r.ownEntry.notes.map(d=>{const n=d.note.original,hit=matched.has(d.note.key||d.note.name);return `<div style="padding:8px;margin:8px 0;border-left:4px solid ${hit?'#bb86ed':'var(--line)'}"><b>${hit?'VALOR COINCIDENTE · ':''}NF-e nº ${esc(n.num)} · série ${esc(n.series||'—')} · ${money(n.amount)}</b><br>Entrada · emissão própria${n.key?`<details><summary>Ver chave</summary>${esc(n.key)}</details>`:''}</div>`}).join('')}</details></div>`;
  }).join('');
}
function monthlyHtml(rows,aName,bName){return `<div class="table-scroll"><table class="tax-table"><thead><tr><th>Competência</th><th>Movimento</th><th>${esc(aName)}</th><th>${esc(bName)}</th><th>Diferença (B − A)</th><th>Resultado</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.period)}</td><td>${movement(r.direction)}</td><td>${money(r.left?.amount)}</td><td>${money(r.right?.amount)}</td><td>${money(r.difference)}</td><td>${r.difference===null?'Sem total correspondente':Math.abs(r.difference)<=1?'Confere':esc(r.cfopClue||'Divergência')}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum registro no filtro selecionado.</td></tr>'}</tbody></table></div>`}

if(typeof document!=='undefined'){
  const root=document.getElementById('sheetCompare');
  if(root){
    const $=id=>document.getElementById(id),status=$('sheetStatus'),results=$('sheetResults'),run=$('sheetRun');let result=null;
    function reset(){result=null;results.innerHTML='';$('sheetCsv').disabled=true;$('sheetPrint').disabled=true;status.textContent='Selecione o relatório e a fonte para comparar.'}
    function mode(){const value=$('sheetMode').value;$('sheetOtherWrap').hidden=value!=='sheet';$('sheetPdfWrap').hidden=value!=='pdf';$('sheetXmlHelp').hidden=value!=='xml';reset()}
    $('sheetMode').addEventListener('change',mode);
    root.querySelectorAll('input,select').forEach(el=>el.addEventListener('change',reset));
    ['xmlFiles','xmlFolderFiles','xmlZipFiles'].forEach(id=>$(id)?.addEventListener('change',reset));
    ['checkXml','clearXml'].forEach(id=>$(id)?.addEventListener('click',reset));
    $('sheetClear').onclick=()=>{root.querySelectorAll('input').forEach(el=>el.value='');reset()};
    run.onclick=async()=>{
      reset();run.disabled=true;root.querySelectorAll('input,select').forEach(el=>el.disabled=true);status.textContent='Lendo e comparando os arquivos neste navegador…';
      try{
        const basis=$('sheetDateBasis').value,rawA=await readReport($('sheetFile').files[0],basis);let rawB;
        const kind=$('sheetMode').value,typed=digits($('sheetCompany').value),inferred=rawA.companies.length===1?rawA.companies[0]:'';
        if(typed&&typed.length!==14)throw new Error('Informe os 14 dígitos do CNPJ da empresa.');
        if(rawA.companies.length>1)throw new Error('A planilha contém emissões próprias de mais de um CNPJ. Exporte uma empresa por arquivo.');
        if(typed&&inferred&&typed!==inferred)throw new Error('O CNPJ informado é diferente do CNPJ de emissão própria identificado na planilha.');
        const company=typed||inferred;
        if(kind==='xml'){
          if(!company)throw new Error('Informe o CNPJ da empresa para distinguir entradas e saídas dos XMLs.');
          const notes=globalThis.portalSheetBridge?.getXmlNotes()||[];if(!notes.length)throw new Error('Primeiro selecione os XMLs ou ZIPs acima e clique em “Conferir pasta/arquivos”.');
          rawB=fromXml(notes,company);
        }else if(kind==='sheet'){
          rawB=await readReport($('sheetOther').files[0],basis);if(rawB.companies.length>1||company&&rawB.companies.some(c=>c!==company))throw new Error('As planilhas identificam empresas diferentes. Confira o CNPJ e os arquivos.');
        }else{
          if(!company)throw new Error('Informe o CNPJ da empresa para conferir se o Livro PDF corresponde ao relatório.');
          const file=$('sheetPdf').files[0];if(!file)throw new Error('Selecione o Livro Fiscal em PDF.');
          const book=await globalThis.portalSheetBridge?.readBook(file);if(!book?.totals?.length)throw new Error('Esta comparação aceita o Livro ICMS P9 com totais mensais. Para NFS-e, use a conferência de ISSQN acima.');
          if(!book.ownCnpj)throw new Error('O CNPJ do estabelecimento não foi identificado no Livro PDF. Exporte um P9 com cabeçalho.');
          if(company&&book.ownCnpj&&company!==book.ownCnpj)throw new Error('O CNPJ do Livro PDF é diferente da empresa da planilha.');
          const totals=new Map();for(const t of book.totals){const key=t.competencia+'|'+t.direction,old=totals.get(key)||{period:t.competencia,direction:t.direction,amount:0};old.amount+=Math.round(t.valorContabil*100);totals.set(key,old)}rawB={name:file.name,totals:[...totals.values()]};
        }
        const a=filtered(rawA,$('sheetMonth').value,$('sheetDirection').value),b=filtered(rawB,$('sheetMonth').value,$('sheetDirection').value),months=compareMonthly(a,b),rows=kind==='pdf'?[]:reconcile(a,b);
        if(!a.notes.length)throw new Error('Nenhuma nota na planilha A para os filtros escolhidos.');
        months.forEach(r=>{r.cfopClue=cfopClueForMonth(r,a,b);r.ownEntry=ownEntryForMonth(r,a,b);if(r.ownEntry.matched.length)r.cfopClue='Valor faltante bate com nota(s) de entrada de emissão própria'});
        const labels={a:'Planilha A',b:kind==='pdf'?'Livro PDF':kind==='xml'?'XMLs':'Planilha B'};
        const totals=monthlyHtml(months,labels.a,labels.b)+ownEntrySheetHtml(months)+outputEntryCfopSheetHtml(a,b);
        const differences=rows.filter(r=>r.issues.length),same=rows.length-differences.length;
        const summary=`<p><b>${esc(rawA.name)}</b>${rawA.sheet?` · aba ${esc(rawA.sheet)}`:''}<br>${rawA.sourceRows} linha(s) de origem → ${rawA.notes.length} nota(s) única(s). O valor da nota é contado uma vez por chave, sem somar novamente as linhas dos itens.<br><b>Outra fonte:</b> ${esc(rawB.name)}${company?`<br><b>CNPJ da empresa:</b> ${esc(company)}`:'<br>CNPJ da empresa não identificado no relatório. Confira se as duas exportações pertencem ao mesmo estabelecimento.'}</p><p>Critério de mês: ${esc($('sheetDateBasis').selectedOptions[0].text)}. Totais excluem documentos marcados como cancelados, denegados ou inutilizados na respectiva fonte. Os valores originais permanecem nos detalhes.</p>${rawB.outside?`<p>${rawB.outside} XML(s) fora do CNPJ informado não entraram na comparação.</p>`:''}${kind==='pdf'?'<p>O P9 permite comparar totais por mês e movimento. Ele não identifica individualmente as notas.</p>':`<p><b>${same} nota(s) conferem · ${differences.length} registro(s) para revisar.</b> A chave de acesso tem prioridade. Sem chave, a correspondência usa modelo, série, número, movimento e CPF/CNPJ da contraparte.</p>`}`;
        const details=rows=>`<div class="table-scroll"><table class="tax-table"><thead><tr><th>Nota</th><th>Movimento / competência A e B</th><th>Valor A</th><th>Valor B</th><th>Diferença (B − A)</th><th>Situação A / B</th><th>Resultado</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${noteDescription(r.left||r.right)}</td><td>${movement((r.left||r.right).direction)}<br>${esc(r.left?.period||'—')} / ${esc(r.right?.period||'—')}</td><td>${money(r.left?.amount)}</td><td>${money(r.right?.amount)}</td><td>${money(r.difference)}</td><td>${noteState(r.left)} / ${noteState(r.right)}</td><td>${esc(r.issues.join(' · ')||'Confere')}${r.left?.ownEntryEmission||r.right?.ownEntryEmission?'<br><b>ENTRADA · EMISSÃO PRÓPRIA</b>':''}${r.fallback?'<br><small>Correspondência sem chave</small>':''}${r.left&&!r.left.excluded&&r.right?.cancelled?`<br><b>${compareWarning}</b>`:''}</td></tr>`).join('')}</tbody></table></div>`;
        // Detailed output is paged to keep larger C170 reports responsive.
        let page=0;const render=()=>{const all=$('sheetShowAll')?.checked||false,list=all?rows:differences,max=Math.max(1,Math.ceil(list.length/100));page=Math.min(page,max-1);$('sheetDetails').innerHTML=details(list.slice(page*100,page*100+100));$('sheetPage').textContent=`Página ${page+1} de ${max} · ${list.length} registro(s)`;$('sheetPrev').disabled=page===0;$('sheetNext').disabled=page>=max-1};
        results.innerHTML=summary+totals+(kind!=='pdf'?`<label><input type="checkbox" id="sheetShowAll"> Mostrar também notas que conferem</label><div id="sheetDetails"></div><div class="button-row"><button class="field" id="sheetPrev" type="button">Anterior</button><span id="sheetPage"></span><button class="field" id="sheetNext" type="button">Próxima</button></div>`:'');
        if(kind!=='pdf'){render();$('sheetShowAll').onchange=()=>{page=0;render()};$('sheetPrev').onclick=()=>{page--;render()};$('sheetNext').onclick=()=>{page++;render()}}
        result={a,b,months,rows,labels,summary,totals,details,differences};$('sheetCsv').disabled=false;$('sheetPrint').disabled=false;status.textContent='Comparação concluída. Confira os totais e as diferenças abaixo.';
      }catch(e){status.textContent=e.message||'Não foi possível concluir a comparação.';results.innerHTML=''}finally{run.disabled=false;root.querySelectorAll('input,select').forEach(el=>el.disabled=false)}
    };
    $('sheetCsv').onclick=()=>{if(!result)return;const {months,rows,labels}=result;const data=[['Tipo','Competência A','Competência B','Movimento','Chave','Número','Série','Valor '+labels.a,'Valor '+labels.b,'Diferença B − A','Situação A','Situação B','Resultado']];
      for(const r of months)data.push(['TOTAL MENSAL',r.period,r.period,movement(r.direction),'','','',r.left?.amount/100,r.right?.amount/100,r.difference===null?'':r.difference/100,'','',r.difference===null?'Sem total correspondente':Math.abs(r.difference)<=1?'Confere':r.cfopClue||'Divergência']);
      for(const r of rows){const n=r.left||r.right;data.push(['NOTA',r.left?.period,r.right?.period,movement(n.direction),n.key,n.num,n.series,r.left?r.left.amount/100:'',r.right?r.right.amount/100:'',r.difference===null?'':r.difference/100,r.left?.sit,r.right?.sit,r.issues.join(' · ')||'Confere'])}
      const csv=data.map(r=>r.map(v=>neutralizeCsv(typeof v==='number'?(Number.isFinite(v)?v.toFixed(2).replace('.',','):''):v)).join(';')).join('\r\n');download(csv,'comparativo-planilha-c100-c170.csv','text/csv;charset=utf-8');
    };
    $('sheetPrint').onclick=()=>{if(!result)return;const win=window.open('','_blank');if(!win){status.textContent='Permita pop-ups para abrir o PDF do comparativo.';return}const {summary,totals,details,differences}=result;win.document.open();win.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Comparativo C100/C170</title><style>body{font:12px Arial;color:#30253e;padding:20px}h1{color:#68429a}table{border-collapse:collapse;width:100%;margin:14px 0}td,th{padding:6px;border:1px solid #ddd;text-align:left;overflow-wrap:anywhere}th{background:#f2ecfa}small{font-size:9px}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:10mm}@media print{button{display:none}}</style><h1>Portal Contábil · Comparativo C100/C170</h1><p>${esc(new Date().toLocaleString('pt-BR'))}</p>${summary}${totals}${differences.length?`<h2>Notas para revisar (${differences.length})</h2>${details(differences)}`:''}<button onclick="window.print()">Imprimir / salvar PDF</button></html>`);win.document.close();win.focus()};
    mode();
  }
}
