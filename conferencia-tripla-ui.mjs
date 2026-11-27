import {parseSped,parseXml,parseBookRows,reconcileThree,taxFields,labels} from './conferencia-tripla.mjs';
import {cents,parseDelimited} from './sheet-compare.mjs';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('pt-BR'),money=n=>n==null?'Não disponível':(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const bookHeaders=['chv_nfe','num_doc','ser','ind_oper','cod_sit','vl_doc','cfop','cst_icms','vl_bc_icms','vl_icms','vl_bc_icms_st','vl_icms_st','vl_ipi','vl_pis','vl_cofins'];
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
     const old=totals.get(k)||{period:t.competencia,direction:t.direction,amount:0};
     old.amount+=Math.round(Number(t.valorContabil)*100);totals.set(k,old);
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
function render(){
 $('meta').textContent='CNPJ '+meta.cnpj+' · Competência '+result.period+' · Livro: '+result.bookMode+' · SPED '+meta.version+' · Tolerância por campo '+money(meta.tolerance);
 const counts=[['Notas cruzadas / localizadas',result.notes.length],['Ocorrências de conferência',result.issues.length],['Ausências identificadas',result.issues.filter(i=>i.type==='Documento ausente').length],['Duplicidades',result.issues.filter(i=>i.type==='Duplicidade').length],['Ocorrências de cancelamento',result.issues.filter(i=>i.type==='Cancelada').length],['Divergências de valores e classificação',result.issues.filter(i=>/divergente/.test(i.type)).length]];
 $('metrics').replaceChildren(...counts.map(([name,n])=>{const d=document.createElement('div'),b=document.createElement('b');d.className='metric';d.textContent=name;b.textContent=fmt(n);d.append(b);return d}));
 $('coverage').textContent=(result.bookMode==='totais P9'?'P9 comparado somente por totais de movimento do período; se faltar total de algum mês para um movimento, o total correspondente fica indisponível. Não há confronto individual de notas com o Livro. ':'Livro por documento: campos ausentes não comparados; competência das planilhas depende do escopo confirmado. ')+
 'SPED: '+fmt(meta.c170)+' C170 e '+fmt(meta.c190)+' C190 lidos. A ausência de registros ou documentos não comprova erro fiscal. Totais são preliminares, por chave válida, sem duplicar documentos; cancelados/excluídos não somados. Não há consulta SEFAZ. Diferenças de competência e de escrituração exigem revisão.';
 $('totals').replaceChildren();
 for(const t of result.totals)rowInto($('totals'),[t.direction,...['xml','sped','book','xmlSped','spedBook'].map(k=>money(t[k]))]);
 populateSelect('kind',result.issues.map(i=>i.type));populateSelect('source',result.issues.map(i=>i.source));$('search').value='';page=0;draw();$('report').hidden=false;
}
$('run').onclick=async()=>{
 if(busy)return;
 const cnpj=$('cnpj').value.replace(/\D/g,''),period=$('period').value,periodEnd=$('periodEnd')?.value||period,tolerance=cents($('tolerance').value),files=[...$('xml').files],spedFiles=[...$('sped').files],bookFiles=[...$('book').files];
 if(!/^\d{14}$/.test(cnpj)||!period||tolerance==null||tolerance<0||!files.length||!spedFiles.length||!bookFiles.length||!$('confirm').checked){$('status').textContent='Informe CNPJ, período de competências, tolerância válida, arquivos das três fontes e confirme o escopo.';return}
 const id=++runId;state(true);$('report').hidden=true;result=null;
 try{
  const months=monthsBetween(period,periodEnd);
  progress(5,'Lendo SPED Fiscal...');await delay();const sped=await readSpeds(spedFiles,cnpj,months,id);check(id);
  progress(18,'Lendo XMLs e eventos...');await delay();const xml=await readXml(files,cnpj,id);check(id);
  progress(65,'Lendo Livro Fiscal...');await delay();const book=await readBooks(bookFiles,cnpj,months,id);check(id);
  progress(83,'Cruzando chaves e comparando campos...');await delay();
  result=reconcileThree({xml,sped,book,period,periodEnd,tolerance});
  meta={cnpj,version:sped.header.version,c170:sped.c170,c190:sped.c190,tolerance};
  progress(97,'Preparando relatório...');await delay();check(id);render();
  $('status').textContent='100% — Conferência concluída: '+fmt(result.notes.length)+' documentos; '+fmt(result.issues.length)+' ocorrências.';
 }catch(e){if(id===runId)$('status').textContent='Não concluído: '+e.message}
 finally{if(id===runId)state(false)}
};
$('cancel').onclick=()=>{runId++;state(false);$('status').textContent='Conferência cancelada. Nenhum resultado exportado.'};
for(const id of ['kind','source','search'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;draw()});
$('prev').onclick=()=>{if(page>0){page--;draw()}};$('next').onclick=()=>{if((page+1)*100<filter().length){page++;draw()}};
function sheet(wb,name,rows,widths){const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(wch=>({wch}));if(rows.length>1)ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(wb,ws,name)}
$('model').onclick=()=>{try{const wb=XLSX.utils.book_new();sheet(wb,'Livro por documento',[bookHeaders],[48,14,10,14,14,18,16,16,18,18,18,18,18,18,18]);sheet(wb,'Instruções',[['Campo','Orientação'],['chv_nfe','Chave de 44 dígitos, como TEXTO. Uma linha por nota.'],['ind_oper','0 entrada; 1 saída'],['cod_sit','Situação SPED, se disponível'],['Valores','Valores de documento, não por item. Campo desconhecido em branco.'],['CFOP / CST','Separe códigos múltiplos com ponto e vírgula.'],['Escopo','Somente o estabelecimento e as competências selecionadas.']],[24,100]);XLSX.writeFile(wb,'modelo-livro-fiscal-conferencia.xlsx')}catch(e){$('status').textContent=e.message}};
$('excel').onclick=()=>{
 if(!result)return;
 try{
  const wb=XLSX.utils.book_new();
  sheet(wb,'Diferenças',[['Fonte','Ocorrência','NF','Chave','Movimento','Campo','Fonte A','Fonte B','Orientação'],...result.issues.map(i=>[i.source,i.type,i.num,i.key,i.direction,i.field,typeof i.left==='number'?i.left/100:i.left??'',typeof i.right==='number'?i.right/100:i.right??'',i.note])],[23,32,13,49,13,34,25,25,100]);
  sheet(wb,'Totais',[['Movimento','XML (R$)','SPED (R$)','Livro (R$)','SPED - XML','Livro - SPED'],...result.totals.map(t=>[t.direction,...['xml','sped','book','xmlSped','spedBook'].map(k=>t[k]==null?'':t[k]/100)])],[18,20,20,20,20,20]);
  sheet(wb,'Documentos',[['Chave','NF','Movimento','Situação XML','Situação SPED','Situação Livro',...['XML','SPED','Livro'].flatMap(s=>taxFields.map(f=>s+' '+labels[f]))],...result.notes.map(n=>[n.key,n.num,n.direction,...['xml','sped','book'].map(k=>n[k]?.status||'Não disponível'),...['xml','sped','book'].flatMap(k=>taxFields.map(f=>n[k]?.values[f]==null?'':n[k].values[f]/100))])],[49,14,14,25,25,25,...Array(24).fill(18)]);
  sheet(wb,'Escopo',[['CNPJ',meta.cnpj],['Competência',result.period],['Livro',result.bookMode],['Tolerância por campo',meta.tolerance/100],['Cobertura',$('coverage').textContent],['Observação','Diferenças nominais não constituem conclusão sobre imposto devido. PIS/COFINS somente quando informados.']],[28,115]);
  XLSX.writeFile(wb,'fiscora-conferencia-tripla-'+result.period+'.xlsx');
 }catch(e){$('status').textContent='Falha na exportação: '+e.message}
};
$('pdf').onclick=()=>{
 if(!result)return;
 const win=window.open('','_blank');if(!win){$('status').textContent='Permita pop-ups para imprimir o relatório.';return}
 const d=win.document;d.title='Diferenças XML SPED Livro Fiscal';const style=d.createElement('style');style.textContent='@page{size:A4 landscape;margin:10mm}body{font:12px Arial;color:#252030}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:9px}th,td{border:1px solid #ddd;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}';d.head.append(style);
 const add=(tag,txt)=>{const el=d.createElement(tag);el.textContent=txt;d.body.append(el);return el};
 add('h1','Fiscora — Relatório específico de diferenças');add('p',$('meta').textContent);add('p',$('coverage').textContent);add('h2','Totais por movimento');
 const makeTable=(headers,rows)=>{const t=d.createElement('table'),head=t.createTHead(),r=head.insertRow();for(const h of headers){const th=d.createElement('th');th.textContent=h;r.append(th)}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const v of row){const td=tr.insertCell();td.textContent=v??'—'}}d.body.append(t)};
 makeTable(['Movimento','XML','SPED','Livro','SPED − XML','Livro − SPED'],result.totals.map(t=>[t.direction,...['xml','sped','book','xmlSped','spedBook'].map(k=>money(t[k]))]));
 add('h2','Ocorrências — '+fmt(result.issues.length));makeTable(['Fonte','Ocorrência','NF / chave','Campo','Fonte A','Fonte B','Orientação'],result.issues.map(issueValues));add('p','Documento preliminar de conferência; não substitui escrituração nem determina imposto devido.');win.focus();win.print();
};
