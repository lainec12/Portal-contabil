import {prepareProducts,evaluateProduct,outputRows,createNcmIndex} from './ncm-planilha.mjs';
const $=id=>document.getElementById(id);
const fields=['Cód. do prod','Descrição','NCM','NCM correto'];
const PAGE_SIZE=75;
const status=$('ncm-sheet-status'),progress=$('ncm-progresso');
const button=$('ncm-importar'),cancel=$('ncm-cancelar');
let analyses=[],currentPage=0,runId=0,busy=false;
const yieldUI=()=>new Promise(done=>setTimeout(done,16));
function workbook(){
 if(!globalThis.XLSX)throw Error('Biblioteca Excel indisponível. Atualize a página e tente novamente.');
 return globalThis.XLSX;
}
function downloadXlsx(rows,file){
 const x=workbook(),ws=x.utils.json_to_sheet(rows,{header:fields});
 ws['!cols']=[{wch:21},{wch:54},{wch:17},{wch:20}];
 const wb=x.utils.book_new();x.utils.book_append_sheet(wb,ws,'Classificação NCM');
 x.writeFile(wb,file);
}
function busyState(value){
 busy=value;button.disabled=value;cancel.hidden=!value;
 button.setAttribute('aria-busy',value?'true':'false');
 progress.hidden=!value;
 if(!value)progress.value=0;
}
function inform(message,percentage=0){
 status.textContent=message;
 if(busy){progress.value=Math.max(0,Math.min(100,percentage));}
}
function renderPage(){
 const start=currentPage*PAGE_SIZE;
 const slice=analyses.slice(start,start+PAGE_SIZE);
 const fragment=document.createDocumentFragment();
 for(const p of slice){
  const tr=document.createElement('tr');
  const add=text=>{const td=document.createElement('td');td.textContent=text;tr.append(td);};
  add(p.productCode);add(p.description);add(p.suppliedNcm);
  const cell=document.createElement('td'),input=document.createElement('input');
  input.type='text';input.value=p.correct;input.maxLength=8;
  input.placeholder='Revisar NCM';input.style.width='118px';input.style.minWidth='100px';
  input.setAttribute('aria-label','NCM correto do produto '+(p.productCode||p.row));
  input.addEventListener('input',()=>{
   p.correct=input.value.replace(/\D/g,'').slice(0,8);
   input.value=p.correct;
  });
  cell.append(input);tr.append(cell);
  add(p.originalStatus+' | '+p.status+(p.match!==null?' ('+p.match+'% textual)':''));
  fragment.append(tr);
 }
 $('ncm-sheet-table').replaceChildren(fragment);
 const pages=Math.max(1,Math.ceil(analyses.length/PAGE_SIZE));
 $('ncm-pagina-info').textContent='Página '+(currentPage+1)+' de '+pages+' — itens '+(start+1)+' a '+Math.min(start+PAGE_SIZE,analyses.length)+' de '+analyses.length;
 $('ncm-prev').disabled=currentPage===0;
 $('ncm-next').disabled=currentPage>=pages-1;
}
$('ncm-prev').onclick=()=>{if(currentPage>0){currentPage--;renderPage();}};
$('ncm-next').onclick=()=>{if((currentPage+1)*PAGE_SIZE<analyses.length){currentPage++;renderPage();}};
$('ncm-modelo').onclick=()=>{
 try{downloadXlsx([Object.fromEntries(fields.map(k=>[k,'']))],'modelo-classificacao-ncm.xlsx')}
 catch(e){status.textContent='Não foi possível gerar modelo: '+e.message}
};
cancel.onclick=()=>{runId++;inform('Análise cancelada. Nenhuma alteração foi exportada.');busyState(false);};
button.onclick=async()=>{
 if(busy)return;
 const file=$('ncm-planilha-arquivo').files?.[0];
 if(!file){status.textContent='Selecione a planilha de produtos.';return;}
 const ownId=++runId;
 analyses=[];$('ncm-sheet-result').hidden=true;
 busyState(true);inform('Iniciando: verificando a base NCM salva...',1);
 await yieldUI();
 try{
  if(globalThis.fiscoraNcmReady)await globalThis.fiscoraNcmReady;
  if(ownId!==runId)return;
  const catalog=globalThis.fiscoraNcmCatalog;
  if(!Array.isArray(catalog)||!catalog.length)throw Error('Base NCM indisponível. Atualize a página ou importe outra base oficial.');
  if(file.size>15e6)throw Error('Planilha maior que 15 MB. Divida em partes menores.');
  inform('Lendo os dados da planilha...',5);await yieldUI();
  const x=workbook(),w=x.read(await file.arrayBuffer(),{type:'array',cellDates:false});
  if(ownId!==runId)return;
  const sheet=w.Sheets[w.SheetNames[0]];
  if(!sheet)throw Error('Planilha sem nenhuma aba.');
  const rows=x.utils.sheet_to_json(sheet,{defval:'',raw:false});
  if(rows.length>10000)throw Error('Mais de 10.000 produtos. Divida em lotes.');
  inform('Organizando '+rows.length+' linhas e validando cabeçalhos...',12);await yieldUI();
  const products=prepareProducts(rows);
  if(!products.length)throw Error('Nenhum produto encontrado. Confira os cabeçalhos Cód. do prod, Descrição e NCM.');
  inform('Criando índice de '+catalog.length+' NCMs (uma única vez)...',18);await yieldUI();
  const date=globalThis.fiscoraNcmReferenceDate||'2026-11-24';
  const index=createNcmIndex(catalog,date);
  if(ownId!==runId)return;
  inform('Classificando produtos por lotes...',22);await yieldUI();
  const results=[];
  const CHUNK=25;
  for(let i=0;i<products.length;i+=CHUNK){
   if(ownId!==runId)return;
   const batch=products.slice(i,i+CHUNK);
   for(const item of batch)results.push(evaluateProduct(item,index,date));
   const completed=Math.min(i+CHUNK,products.length);
   inform('Analisando '+completed+' de '+products.length+' produtos...',22+70*completed/products.length);
   await yieldUI();
  }
  if(ownId!==runId)return;
  analyses=results;currentPage=0;
  inform('Preparando resultado e edição da coluna NCM correto...',96);await yieldUI();
  renderPage();$('ncm-sheet-result').hidden=false;
  const suggestions=analyses.filter(p=>p.autoSuggestion).length;
  const pending=analyses.length-suggestions;
  inform(analyses.length+' produtos analisados. '+suggestions+' sugestões para revisão; '+pending+' sem sugestão segura. Confira e baixe o Excel.',100);
 }catch(e){if(ownId===runId){analyses=[];$('ncm-sheet-result').hidden=true;status.textContent='Falha ao processar: '+e.message;}}
 finally{if(ownId===runId)busyState(false);}
};
$('ncm-baixar').onclick=async()=>{
 if(!analyses.length)return;
 $('ncm-baixar').disabled=true;
 status.textContent='Preparando Excel com '+analyses.length+' produtos...';
 await yieldUI();
 try{
  downloadXlsx(outputRows(analyses),'classificacao-ncm-revisao.xlsx');
  status.textContent='Excel exportado com quatro colunas. Revise os NCMs propostos antes de usar.';
 }catch(e){status.textContent='Erro ao exportar: '+e.message;}
 finally{$('ncm-baixar').disabled=false;}
};
