import {sendPacket,monthlyRows as transferRows} from './fluxo-bridge.mjs';
import {parseSped,parseXml,parseBookRows,reconcileThree,taxFields,labels} from './conferencia-tripla.mjs?v=20261127-mensal';
import {cents,parseDelimited} from './sheet-compare.mjs';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('pt-BR'),money=n=>n==null?'Não disponível':(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const bookHeaders=['chv_nfe','num_doc','ser','ind_oper','cod_sit','vl_doc','cfop','cst_icms','vl_bc_icms','vl_icms','vl_bc_icms_st','vl_icms_st','vl_ipi','vl_pis','vl_cofins','competencia'];
const delay=()=>new Promise(r=>setTimeout(r,12));let result=null,meta=null,page=0,runId=0,busy=false;
const safeText=async f=>{const b=await f.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(b)}catch{return new TextDecoder('windows-1252').decode(b)}};
function state(on){busy=on;$('run').disabled=on;$('cancel').hidden=!on;$('progress').hidden=!on;}
function progress(n,msg){$('progress').value=n;$('status').textContent=n+'% — '+msg;}
const check=id=>{if(id!==runId)throw Error('Conferência cancelada.');};
function readP9(file,company,period,periodEnd=period){
 return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe');frame.hidden=true;frame.src='./index.html#conferencia-notas';
  let interval,timeout,ended=false,reading=false;
  const finish=(err,result)=>{if(ended)return;ended=true;clearTimeout(timeout);clearInterval(interval);frame.remove();err?reject(err):resolve(result)};
  timeout=setTimeout(()=>finish(Error('O leitor P9 não respondeu. Use o Livro em Excel/CSV ou a conferência P9 existente.')),45000);
  frame.onload=()=>{interval=setInterval(async()=>{
   if(reading||ended)return;
   try{
    const bridge=frame.contentWindow?.portalSheetBridge;
    if(!bridge?.readBook)return;
    reading=true;
    const book=await bridge.readBook(file);
    if(!book?.totals?.length)throw Error('Não foi possível reconhecer totais do P9.');
    if(!book.ownCnpj||String(book.ownCnpj).replace(/\D/g,'')!==company)throw Error('CNPJ do Livro P9 ausente ou divergente.');
    const totals=new Map();
    for(const t of book.totals){
     if(t.competencia<period||t.competencia>periodEnd)continue;
     const k=t.competencia+'|'+t.direction;
     if(!Number.isFinite(Number(t.valorContabil)))throw Error('Valor contábil do P9 inválido.');
     const old=totals.get(k)||{period:t.competencia,direction:t.direction,amount:0,values:{bcICMS:0,icms:0,isentas:0,outras:0}};
     old.amount+=Math.round(Number(t.valorContabil)*100);
     for(const [dest,src] of [['bcICMS','baseIcms'],['icms','icms'],['isentas','isentas'],['outras','outras']]){
      const v=t[src];old.values[dest]=old.values[dest]==null||v==null||v===''||!Number.isFinite(Number(v))?null:old.values[dest]+Math.round(Number(v)*100);
     }
     totals.set(k,old);
    }
    if(!totals.size)throw Error('Competência selecionada não encontrada no P9.');
    finish(null,{totals:[...totals.values()],issues:[]});
   }catch(e){finish(e)}
  },150)};
  document.body.append(frame);
 });
}
async function readBook(file,company,period,periodEnd=period){
 if(/\.pdf$/i.test(file.name))return readP9(file,company,period,periodEnd);
 if(/\.csv$/i.test(file.name))return parseBookRows(parseDelimited(await safeText(file)));
 if(!/\.xlsx?$/i.test(file.name))throw Error('Formato de Livro não aceito.');
 if(!globalThis.XLSX)throw Error('Biblioteca Excel indisponível.');
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
 const matches=wb.SheetNames.map(name=>XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''})).filter(rows=>rows.some(r=>r.map(x=>String(x).trim().toLowerCase()).includes('chv_nfe')));
 if(matches.length!==1)throw Error('O Livro precisa ter uma aba por documento com chv_nfe. Baixe o modelo.');
 return parseBookRows(matches[0]);
}
function monthsBetween(start,end){
 const valid=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
 if(!valid(start)||!valid(end)||start>end)throw Error('Informe competência inicial e final válidas, em ordem.');
 let y=Number(start.slice(0,4)),m=Number(start.slice(5,7));const months=[];
 while(true){const p=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0');months.push(p);if(p===end)break;if(++m===13){m=1;y++}}
 return months;
}
async function readSpeds(files,company,months,id){
 const out={docs:[],issues:[],header:{version:''},c170:0,c190:0},seen=new Set(),versions=new Set();
 for(const file of files){
  check(id);const p=parseSped(await safeText(file),{cnpj:company});const month=p.header.start.slice(0,7);
  if(!months.includes(month)||p.header.end.slice(0,7)!==month)throw Error('SPED '+file.name+': competência fora do período ou arquivo não mensal.');
  if(seen.has(month))throw Error('Mais de um SPED para '+month+'. Envie somente o arquivo vigente de cada mês.');
  seen.add(month);versions.add(p.header.version);out.docs.push(...p.docs);out.issues.push(...p.issues);out.c170+=p.c170;out.c190+=p.c190;
 }
 const missing=months.filter(m=>!seen.has(m));if(missing.length)throw Error('Faltam arquivos SPED das competências: '+missing.join(', '));
 out.header.version=[...versions].join(', ');return out;
}
async function readBooks(files,company,months,id){
 const pdf=files.every(f=>/\.pdf$/i.test(f.name));
 if(!pdf&&files.some(f=>/\.pdf$/i.test(f.name)))throw Error('Não misture livros P9 em PDF com livros por documento em planilha/CSV.');
 const out=pdf?{totals:[],issues:[]}:{docs:[],issues:[]},seen=new Set();
 for(const file of files){
  check(id);const b=await readBook(file,company,months[0],months[months.length-1]);check(id);
  if(pdf){for(const t of b.totals){const key=t.period+'|'+t.direction;if(seen.has(key))throw Error('P9 repetido para '+key+'. Confira os arquivos.');seen.add(key);out.totals.push(t)}}
  else out.docs.push(...b.docs);
  out.issues.push(...(b.issues||[]));
 }
 if(pdf){const missing=months.filter(m=>!out.totals.some(t=>t.period===m));if(missing.length)throw Error('Faltam totais P9 das competências: '+missing.join(', '))}
 return out;
}
async function readXml(files,company,id){
 const xml={docs:[],events:[],issues:[]};let processed=0,bytes=0;
 const consume=async(raw,name)=>{
  check(id);bytes+=raw.length;
  if(bytes>500*1024*1024)throw Error('Lote XML expandido excede 500 MB. Divida a competência em lotes.');
  try{const p=parseXml(raw,company);xml.docs.push(...p.docs);xml.events.push(...p.events);xml.issues.push(...p.issues);}
  catch(e){xml.issues.push({source:'XML',type:'Falha de leitura',key:'',num:'',field:'Arquivo',left:name,right:'',note:e.message})}
  if(++processed%20===0){progress(20,'Lendo XMLs: '+fmt(processed)+' arquivos · '+fmt(xml.docs.length)+' documentos do estabelecimento');await delay()}
 };
 for(const file of files){
  check(id);
  if(/\.xml$/i.test(file.name))await consume(await safeText(file),file.name);
  else if(/\.zip$/i.test(file.name)){
   if(!globalThis.JSZip)throw Error('Leitor ZIP indisponível. Envie XMLs descompactados ou verifique a conexão.');
   const zip=await JSZip.loadAsync(file);
   for(const entry of Object.values(zip.files)){
    check(id);if(!entry.dir&&/\.xml$/i.test(entry.name))await consume(await entry.async('string'),entry.name);
   }
  }
 }
 if(!xml.docs.length&&!xml.events.length)throw Error('Nenhum XML NF-e/NFC-e do estabelecimento encontrado. Confira o CNPJ.');
 return xml;
}
const valueText=(v,issue)=>v==null?'—':typeof v==='number'?money(v):String(v);
function rowInto(body,values){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v==null?'—':String(v);tr.append(td)}body.append(tr);return tr}
const issueValues=i=>[i.source,i.type,(i.num?'NF '+i.num+' · ':'')+(i.key||'Sem chave'),i.field,valueText(i.left,i),valueText(i.right,i),i.note];
function filter(){const kind=$('kind').value,source=$('source').value,q=$('search').value.trim();return result.issues.filter(i=>(!kind||i.type===kind)&&(!source||i.source===source)&&(!q||(i.key||'').includes(q)||(i.num||'').includes(q)))}
function draw(){
 const items=filter(),pages=Math.max(1,Math.ceil(items.length/100));page=Math.min(page,pages-1);
 const body=$('issues');body.replaceChildren();
 for(const i of items.slice(page*100,page*100+100)){const row=rowInto(body,issueValues(i));row.children[1].className='attention'}
 if(!items.length)rowInto(body,['Nenhuma ocorrência para os filtros']);
 $('pages').textContent='Página '+fmt(page+1)+' de '+fmt(pages)+' · '+fmt(items.length)+' ocorrências';
 $('prev').disabled=page===0;$('next').disabled=page>=pages-1;
}
function populateSelect(id,values){const s=$(id);s.replaceChildren(new Option('Todas',''),...[...new Set(values)].sort().map(v=>new Option(v,v)))}
const sourceLabels={xml:'XML',sped:'SPED',book:'Livro Fiscal'};
function totalColumns(){
 const names=result.sources,has=k=>names.includes(k);
 return [...names.map(k=>[k,sourceLabels[k]]),...(has('xml')&&has('sped')?[['xmlSped','SPED − XML']]:[]),...(has('sped')&&has('book')?[['spedBook','Livro − SPED']]:[]),...(has('xml')&&has('book')?[['xmlBook','Livro − XML']]:[])];
}
function totalHeaders(){return ['Movimento',...totalColumns().map(([,label])=>label)]}
function totalRows(format){return result.totals.map(t=>[t.direction,...totalColumns().map(([k])=>format(t[k]))])}
function monthlyHeaders(){return ['Competência','Movimento','Campo',...totalColumns().map(([,label])=>label),'Resultado']}
function monthlyValues(r,format){return [r.period,r.direction==='entrada'?'Entrada':'Saída',r.label,...totalColumns().map(([k])=>format(r[k])),r.status]}
function drawMonthly(){
 const month=$('month-filter').value,movement=$('movement-filter').value,only=$('monthly-only').checked;
 const rows=result.monthlyRows.filter(r=>(!month||r.period===month)&&(!movement||r.direction===movement)&&(!only||r.status==='DIVERGENTE'));
 $('monthly-body').replaceChildren();
 for(const r of rows){const tr=rowInto($('monthly-body'),monthlyValues(r,money));if(r.status==='DIVERGENTE')tr.className='monthly-diff';else if(r.status==='CONFERE')tr.lastElementChild.className='monthly-ok'}
 $('monthly-count').textContent=fmt(rows.length)+' linhas · '+fmt(rows.filter(r=>r.status==='DIVERGENTE').length)+' divergências.';
}
for(const id of ['month-filter','movement-filter','monthly-only'])$(id).addEventListener('change',()=>{if(result)drawMonthly()});

const notePeriod=n=>n.sped?.period||n.book?.period||n.xml?.date?.slice(0,7)||n.sped?.entryDate?.slice(0,7)||n.sped?.date?.slice(0,7)||'Não informada';
const movementName=d=>d==='entrada'?'Entradas':d==='saida'?'Saídas':'Não informado';
const coverageIssue=i=>['C170 não disponível','C190 não disponível'].includes(i.type);
let noteIndex=new Map(),noteGroups=[],issueByKey=new Map();
function buildNoteIndex(){
 noteIndex=new Map();issueByKey=new Map();const groups=new Map();
 for(const i of result.issues){if(!i.key)continue;if(!issueByKey.has(i.key))issueByKey.set(i.key,[]);issueByKey.get(i.key).push(i)}
 for(const n of result.notes){noteIndex.set(n.key,n);const p=notePeriod(n),k=p+'|'+n.direction;if(!groups.has(k))groups.set(k,{period:p,direction:n.direction,notes:[]});groups.get(k).notes.push(n)}
 noteGroups=[...groups.values()].sort((a,b)=>a.period.localeCompare(b.period)||a.direction.localeCompare(b.direction));
}
const reviewIssues=n=>(issueByKey.get(n.key)||[]).filter(i=>!coverageIssue(i));
const documentSources=()=>result.sources.filter(k=>k!=='book'||result.bookMode==='documentos');
function noteStatus(n){
 const issues=reviewIssues(n);
 if(issues.some(i=>i.type==='Cancelada'))return 'Cancelada';
 if(issues.length)return 'Revisar ('+issues.length+')';
 return documentSources().length<2?'Localizada — sem confronto individual':'Sem divergência detectada';
}
function selectedGroups(){
 const p=$('note-month').value,d=$('note-movement').value,q=$('note-query').value.trim().toLowerCase(),mode=$('note-mode').value;
 return noteGroups.filter(g=>(!p||g.period===p)&&(!d||g.direction===d)).map(g=>({...g,notes:g.notes.filter(n=>(!q||String(n.num||'').toLowerCase().includes(q)||n.key.includes(q))&&(mode==='all'||reviewIssues(n).length>0))})).filter(g=>g.notes.length);
}
function element(d,tag,txt){const el=d.createElement(tag);if(txt!=null)el.textContent=txt;return el}
function tableFor(d,headers,rows){
 const t=element(d,'table'),head=t.createTHead(),r=head.insertRow();for(const h of headers)r.append(element(d,'th',h));
 const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const v of row)tr.append(element(d,'td',v??'—'))}return t;
}
function noteDetail(d,n,withItems=true){
 const section=element(d,'div');section.className='note-detail';
 section.append(element(d,'p','Chave: '+n.key+' · Competência: '+notePeriod(n)+' · '+movementName(n.direction)+' · '+noteStatus(n)));
 const src=documentSources(),pairs=[['xml','sped'],['sped','book'],['xml','book']].filter(([a,b])=>src.includes(a)&&src.includes(b));
 for(const k of src){const v=n[k];section.append(element(d,'p',sourceLabels[k]+': '+(v?('Série '+(v.series||'—')+' · Modelo '+(v.model||'—')+' · Emissão '+(v.date||'—')+' · Entrada/saída '+(v.entryDate||'—')+' · '+v.status):'Não localizado')))}
 if(result.bookMode==='totais P9')section.append(element(d,'p','Livro P9: total mensal, sem dados individuais da nota.'));
 section.append(tableFor(d,['Campo',...src.map(k=>sourceLabels[k]),...pairs.map(([a,b])=>sourceLabels[b]+' − '+sourceLabels[a])],taxFields.map(f=>[labels[f],...src.map(k=>n[k]?money(n[k].values?.[f]):'Não localizado'),...pairs.map(([a,b])=>n[a]?.values?.[f]!=null&&n[b]?.values?.[f]!=null?money(n[b].values[f]-n[a].values[f]):'Não disponível')])));
 for(const k of src){
  const v=n[k];if(!v)continue;
  const codes=[...new Set([...(v.cfops||[]),...(v.analytic||[]).map(a=>a.cfop),...(v.items||[]).map(a=>a.cfop)].filter(Boolean))];
  const csts=[...new Set([...(v.csts||[]),...(v.analytic||[]).map(a=>a.cstICMS),...(v.items||[]).map(a=>a.cstICMS)].filter(Boolean))];
  section.append(element(d,'p',sourceLabels[k]+' · CFOP: '+(codes.join(', ')||'Não informado')+' · CST/CSOSN: '+(csts.join(', ')||'Não informado')));
  if(v.analytic?.length){section.append(element(d,'h4',sourceLabels[k]+' — C190 / classificação analítica'),tableFor(d,['CFOP','CST','Alíquota','Valor operação','Base ICMS','ICMS','ICMS-ST','IPI'],v.analytic.map(a=>[a.cfop,a.cstICMS,a.rate,...['valor','bcICMS','icms','st','ipi'].map(f=>money(a.values?.[f]))])))}
  if(withItems&&v.items?.length){const det=element(d,'details');det.append(element(d,'summary',sourceLabels[k]+' — Itens ('+fmt(v.items.length)+')'));if(d!==document)det.open=true;
   det.append(tableFor(d,['Item','Produto','CFOP','CST','Valor','Base ICMS','ICMS','PIS','COFINS'],v.items.map(a=>[a.num,a.description||a.code,a.cfop,a.cstICMS,...['valor','bcICMS','icms','pis','cofins'].map(f=>money(a.values?.[f]))])));section.append(det)}
 }
 const issues=issueByKey.get(n.key)||[];
 if(issues.length){section.append(element(d,'h4','Ocorrências da nota'),tableFor(d,['Fonte','Ocorrência','Campo','Valor A','Valor B','Orientação'],issues.map(i=>[i.source,i.type,i.field,valueText(i.left,i),valueText(i.right,i),i.note])))}
 return section;
}
function drawNotes(){
 const groups=selectedGroups(),root=$('note-groups');root.replaceChildren();
 $('note-count').textContent=fmt(groups.reduce((a,g)=>a+g.notes.length,0))+' notas em '+fmt(groups.length)+' grupos. Abra uma competência para consultar.';
 for(const g of groups){
  const det=element(document,'details');det.append(element(document,'summary',g.period+' · '+movementName(g.direction)+' · '+fmt(g.notes.length)+' notas · '+fmt(g.notes.filter(n=>reviewIssues(n).length).length)+' para revisar'));
  let loaded=false;
  det.addEventListener('toggle',()=>{if(!det.open||loaded)return;loaded=true;let pg=0;const controls=element(document,'div'),list=element(document,'div'),prev=element(document,'button','Anterior'),next=element(document,'button','Próxima'),status=element(document,'span');prev.className=next.className='secondary';controls.className='actions';controls.append(prev,status,next);det.append(controls,list);
   const drawPage=()=>{list.replaceChildren();const count=Math.ceil(g.notes.length/50);status.textContent='Página '+(pg+1)+' de '+count;prev.disabled=pg===0;next.disabled=pg+1>=count;
    for(const n of g.notes.slice(pg*50,pg*50+50)){const nd=element(document,'details');nd.append(element(document,'summary','NF '+(n.num||'—')+' · '+noteStatus(n)+' · '+documentSources().map(k=>sourceLabels[k]+': '+money(n[k]?.values?.valor)).join(' | ')));let opened=false;nd.addEventListener('toggle',()=>{if(nd.open&&!opened){opened=true;nd.append(noteDetail(document,n))}});list.append(nd)}
   };prev.onclick=()=>{if(pg>0){pg--;drawPage()}};next.onclick=()=>{if((pg+1)*50<g.notes.length){pg++;drawPage()}};drawPage();
  });root.append(det);
 }
}
for(const id of ['note-month','note-movement','note-query','note-mode'])$(id).addEventListener(id==='note-query'?'input':'change',()=>{if(result)drawNotes()});

function render(){
 $('meta').textContent='CNPJ '+meta.cnpj+' · Competência '+result.period+' · Fontes: '+result.sources.map(k=>sourceLabels[k]).join(' × ')+' · Livro: '+result.bookMode+(meta.version?' · SPED '+meta.version:'')+' · Tolerância por campo '+money(meta.tolerance);
 const counts=[['Documentos localizados',result.notes.length],['Ocorrências de conferência',result.issues.length],['Ausências identificadas',result.issues.filter(i=>i.type==='Documento ausente').length],['Duplicidades',result.issues.filter(i=>i.type==='Duplicidade').length],['Ocorrências de cancelamento',result.issues.filter(i=>i.type==='Cancelada').length],['Divergências de valores e classificação',result.issues.filter(i=>/divergente/.test(i.type)).length],['Campos mensais divergentes',result.monthlyRows.filter(r=>r.status==='DIVERGENTE').length]];
 $('metrics').replaceChildren(...counts.map(([name,n])=>{const d=document.createElement('div'),b=document.createElement('b');d.className='metric';d.textContent=name;b.textContent=fmt(n);d.append(b);return d}));
 $('coverage').textContent=(result.bookMode==='não enviado'?'Livro Fiscal não enviado: não comparado. ':result.bookMode==='totais P9'?'P9 comparado por totais mensais de valor contábil, base e ICMS, quando informados. Não há confronto individual de notas com o Livro. ':'Livro por documento: campos ausentes não comparados; competência das planilhas depende do escopo confirmado. ')+
 (result.sources.includes('sped')?'SPED: '+fmt(meta.c170)+' C170 e '+fmt(meta.c190)+' C190 lidos. ':'SPED não enviado: não comparado. ')+(result.sources.includes('xml')?'':'XML não enviado: não comparado. ')+ 'A ausência de registros ou documentos não comprova erro fiscal. Totais são preliminares, por chave válida, sem duplicar documentos; cancelados/excluídos não somados. Não há consulta SEFAZ. Diferenças de competência e de escrituração exigem revisão.';
 $('total-head').replaceChildren(...totalHeaders().map(h=>{const th=document.createElement('th');th.textContent=h;return th}));
 $('totals').replaceChildren();
 for(const row of totalRows(money))rowInto($('totals'),row);
 $('monthly-head').replaceChildren(...monthlyHeaders().map(h=>{const th=document.createElement('th');th.textContent=h;return th}));
 populateSelect('month-filter',result.monthlyRows.map(r=>r.period));$('movement-filter').value='';$('monthly-only').checked=false;drawMonthly();
 populateSelect('kind',result.issues.map(i=>i.type));populateSelect('source',result.issues.map(i=>i.source));$('search').value='';page=0;draw();buildNoteIndex();populateSelect('note-month',noteGroups.map(g=>g.period));$('note-movement').value='';$('note-mode').value='all';$('note-query').value='';drawNotes();$('report').hidden=false;
}
$('run').onclick=async()=>{
 if(busy)return;
 const cnpj=$('cnpj').value.replace(/\D/g,''),period=$('period').value,periodEnd=$('periodEnd')?.value||period,tolerance=cents($('tolerance').value),files=[...$('xml').files],spedFiles=[...$('sped').files],bookFiles=[...$('book').files];
 if(!/^\d{14}$/.test(cnpj)||!period||tolerance==null||tolerance<0||[files,spedFiles,bookFiles].filter(f=>f.length).length<2||!$('confirm').checked){$('status').textContent='Informe CNPJ, período de competências, tolerância válida, arquivos de pelo menos duas fontes e confirme o escopo.';return}
 const id=++runId;state(true);$('report').hidden=true;result=null;
 try{
  const months=monthsBetween(period,periodEnd);
  progress(5,'Lendo SPED Fiscal...');await delay();const sped=spedFiles.length?await readSpeds(spedFiles,cnpj,months,id):null;check(id);
  progress(18,'Lendo XMLs e eventos...');await delay();const xml=files.length?await readXml(files,cnpj,id):null;check(id);
  progress(65,'Lendo Livro Fiscal...');await delay();const book=bookFiles.length?await readBooks(bookFiles,cnpj,months,id):null;check(id);
  progress(83,'Cruzando chaves e comparando campos...');await delay();
  result=reconcileThree({xml,sped,book,period,periodEnd,tolerance});
  meta={cnpj,version:sped?.header.version||'',c170:sped?.c170||0,c190:sped?.c190||0,tolerance};
  progress(97,'Preparando relatório...');await delay();check(id);render();
  $('status').textContent='100% — Conferência concluída: '+fmt(result.notes.length)+' documentos; '+fmt(result.issues.length)+' ocorrências.';
 }catch(e){if(id===runId)$('status').textContent='Não concluído: '+e.message}
 finally{if(id===runId)state(false)}
};
$('cancel').onclick=()=>{runId++;state(false);$('status').textContent='Conferência cancelada. Nenhum resultado exportado.'};
for(const id of ['kind','source','search'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;draw()});
$('prev').onclick=()=>{if(page>0){page--;draw()}};$('next').onclick=()=>{if((page+1)*100<filter().length){page++;draw()}};
function sheet(wb,name,rows,widths){const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(wch=>({wch}));if(rows.length>1)ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(wb,ws,name)}
$('model').onclick=()=>{try{const wb=XLSX.utils.book_new();sheet(wb,'Livro por documento',[bookHeaders],[48,14,10,14,14,18,16,16,18,18,18,18,18,18,18,16]);sheet(wb,'Instruções',[['Campo','Orientação'],['chv_nfe','Chave de 44 dígitos, como TEXTO. Uma linha por nota.'],['ind_oper','0 entrada; 1 saída'],['cod_sit','Situação SPED, se disponível'],['Valores','Valores de documento, não por item. Campo desconhecido em branco.'],['CFOP / CST','Separe códigos múltiplos com ponto e vírgula.'],['competencia','AAAA-MM, competência de escrituração. Obrigatório para o comparativo mensal de planilhas com vários meses.'],['Escopo','Somente o estabelecimento e as competências selecionadas.']],[24,100]);XLSX.writeFile(wb,'modelo-livro-fiscal-conferencia.xlsx')}catch(e){$('status').textContent=e.message}};
$('excel').onclick=()=>{
 if(!result)return;
 try{
  const wb=XLSX.utils.book_new();
  sheet(wb,'Diferenças',[['Fonte','Ocorrência','NF','Chave','Movimento','Campo','Fonte A','Fonte B','Orientação'],...result.issues.map(i=>[i.source,i.type,i.num,i.key,i.direction,i.field,typeof i.left==='number'?i.left/100:i.left??'',typeof i.right==='number'?i.right/100:i.right??'',i.note])],[23,32,13,49,13,34,25,25,100]);
  sheet(wb,'Totais',[totalHeaders(),...totalRows(v=>v==null?'':v/100)],[18,...totalColumns().map(()=>22)]);
  sheet(wb,'Movimentação mensal',[monthlyHeaders(),...result.monthlyRows.map(r=>monthlyValues(r,v=>v==null?'Não disponível':v/100))],[16,14,45,...totalColumns().map(()=>22),24]);
  const docSources=result.sources.filter(k=>k!=='book'||result.bookMode==='documentos');
  sheet(wb,'Documentos',[['Chave','NF','Competência','Movimento',...docSources.map(k=>'Situação '+sourceLabels[k]),...docSources.flatMap(k=>taxFields.map(f=>sourceLabels[k]+' '+labels[f]))],...result.notes.map(n=>[n.key,n.num,notePeriod(n),n.direction,...docSources.map(k=>n[k]?.status||'Não disponível'),...docSources.flatMap(k=>taxFields.map(f=>n[k]?.values[f]==null?'':n[k].values[f]/100))])],[49,14,16,14,...docSources.map(()=>25),...Array(docSources.length*taxFields.length).fill(18)]);
  sheet(wb,'Escopo',[['CNPJ',meta.cnpj],['Competência',result.period],['Fontes',result.sources.map(k=>sourceLabels[k]).join(' × ')],['Livro',result.bookMode],['Tolerância por campo',meta.tolerance/100],['Cobertura',$('coverage').textContent],['Observação','Diferenças nominais não constituem conclusão sobre imposto devido. PIS/COFINS somente quando informados.']],[28,115]);
  XLSX.writeFile(wb,'fiscora-conferencia-tripla-'+result.period+'.xlsx');
 }catch(e){$('status').textContent='Falha na exportação: '+e.message}
};
function openReport(title){
 const win=window.open('','_blank');if(!win){$('status').textContent='Permita pop-ups para imprimir o relatório.';return null}
 const d=win.document;d.title=title;const style=element(d,'style');
 style.textContent='@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#302340;margin:0}h1{font-size:22px;color:#422764;border-bottom:3px solid #7042a4;padding-bottom:9px}h2{font-size:16px;color:#422764;margin:18px 0 6px}h3{font-size:13px;margin:12px 0 5px}h4{font-size:11px;margin:9px 0 5px}p{line-height:1.4;margin:5px 0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:9px;margin:6px 0 12px}th,td{border:1px solid #ddd;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee8f5;color:#35224f}thead{display:table-header-group}tr{break-inside:avoid}h2,h3,h4{break-after:avoid}.diff td{color:#9c2525;background:#fff0ef}.note-detail{margin:8px 0 16px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
 d.head.append(style);d.body.append(element(d,'h1',title),element(d,'p',$('meta').textContent),element(d,'p','Gerado em '+new Date().toLocaleString('pt-BR')));
 return {win,d};
}
function reportTable(d,headers,rows){const t=tableFor(d,headers,rows);d.body.append(t);return t}
function finishReport(win,d){d.body.append(element(d,'p','Documento preliminar de conferência. Não substitui a escrituração nem determina imposto devido.'));win.focus();win.print()}
$('pdf').onclick=()=>{
 if(!result)return;
 const report=openReport('Fiscora — Relatório detalhado de conferência fiscal');if(!report)return;
 const {win,d}=report;const add=(tag,t)=>d.body.append(element(d,tag,t));
 add('h2','1. Resumo executivo');add('p',$('coverage').textContent);
 const divergences=result.monthlyRows.filter(r=>r.status==='DIVERGENTE'),review=result.issues.filter(i=>!coverageIssue(i)),coverage=result.issues.filter(coverageIssue);
 reportTable(d,['Documentos localizados','Campos mensais divergentes','Ocorrências para revisão','Avisos C170/C190'],[[fmt(result.notes.length),fmt(divergences.length),fmt(review.length),fmt(coverage.length)]]);
 reportTable(d,totalHeaders(),totalRows(money));
 add('h2','2. Movimentação mensal detalhada');add('p',$('monthly-note').textContent);
 const monthlyGroups=new Map();for(const r of result.monthlyRows){if(!monthlyGroups.has(r.period))monthlyGroups.set(r.period,[]);monthlyGroups.get(r.period).push(r)}
 for(const [p,rs] of monthlyGroups){add('h3','Competência '+p);const t=reportTable(d,monthlyHeaders(),rs.map(r=>monthlyValues(r,money)));rs.forEach((r,i)=>{if(r.status==='DIVERGENTE')t.tBodies[0].rows[i].className='diff'})}
 add('h2','3. Divergências e ocorrências por competência');
 add('p','Ocorrências sem vínculo documental ficam em seção própria. Avisos C170/C190 são consolidados, não repetidos por nota. Para obter todas as notas e seus dados, use o PDF de notas individuais.');
 for(const g of noteGroups){const rows=g.notes.flatMap(n=>reviewIssues(n).map(i=>issueValues(i)));if(rows.length){add('h3',g.period+' · '+movementName(g.direction)+' · '+fmt(rows.length)+' ocorrências');reportTable(d,['Fonte','Ocorrência','NF / chave','Campo','Fonte A','Fonte B','Orientação'],rows)}}
 const unlinked=review.filter(i=>!noteIndex.has(i.key)&&i.type!=='Total mensal divergente');
 if(unlinked.length){add('h3','Ocorrências sem nota vinculada');reportTable(d,['Fonte','Ocorrência','NF / chave','Campo','Fonte A','Fonte B','Orientação'],unlinked.map(issueValues))}
 if(coverage.length){add('h2','4. Avisos de cobertura');const m=new Map();for(const i of coverage)m.set(i.type,(m.get(i.type)||0)+1);reportTable(d,['Aviso','Quantidade'],[...m]);add('p','A ausência desses registros pode decorrer de dispensa. Consulte o Excel completo para a lista de avisos.')}
 finishReport(win,d);
};
$('pdf-notes').onclick=()=>{
 if(!result)return;
 const groups=selectedGroups(),count=groups.reduce((a,g)=>a+g.notes.length,0);
 if(!count){$('note-count').textContent='Nenhuma nota corresponde aos filtros.';return}
 if(count>2000){$('note-count').textContent='O PDF detalhado contém '+fmt(count)+' notas. Selecione uma competência ou refine os filtros até 2.000 notas por PDF. O Excel completo permanece disponível.';return}
 const report=openReport('Fiscora — Anexo de notas individuais');if(!report)return;
 const {win,d}=report;d.body.append(element(d,'p',fmt(count)+' notas · Filtros: '+($('note-month').value||'Todas as competências')+' · '+($('note-movement').value||'Todos os movimentos')+' · '+($('note-mode').value==='review'?'Somente revisão':'Todas as notas')+' · Pesquisa: '+($('note-query').value||'—')));
 if(result.bookMode==='totais P9')d.body.append(element(d,'p','O Livro P9 não permite confronto individual. As notas abaixo provêm das fontes documentais enviadas.'));
 for(const g of groups){d.body.append(element(d,'h2',g.period+' · '+movementName(g.direction)+' · '+fmt(g.notes.length)+' notas'));for(const n of g.notes){d.body.append(element(d,'h3','NF '+(n.num||'—')),noteDetail(d,n,true))}}
 finishReport(win,d);
};

$('flow-send').onclick=()=>{if(!result)return;try{sendPacket({kind:'trip',cnpj:meta.cnpj,rows:transferRows(result.monthlyRows),description:'Conferência '+result.sources.join(' × ')})}catch(e){$('status').textContent=e.message}};
