// Até 100.000 produtos: análise e exportação em Worker, sem bloquear a interface.
const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('pt-BR');
const fields=['Cód. do prod','Descrição','NCM','NCM correto'];
const SIZE=75,MAX_FILE=120*1024*1024;
const status=$('ncm-sheet-status'),progress=$('ncm-progresso'),counter=$('ncm-contador-progresso');
const start=$('ncm-importar'),cancel=$('ncm-cancelar'),download=$('ncm-baixar');
let rows=[],shown=[],page=0,worker=null,working='',complete=false;
const yieldUI=()=>new Promise(r=>setTimeout(r,15));
function state(kind=''){
 working=kind;start.disabled=!!kind;cancel.hidden=!kind;download.disabled=!!kind||!complete;
 cancel.textContent=kind==='export'?'Cancelar exportação':'Cancelar análise';
 progress.hidden=!kind;counter.hidden=!kind;
 start.setAttribute('aria-busy',kind?'true':'false');
}
function update(message,percent=0,n=0,total=0){
 status.textContent=message;progress.value=Math.max(0,Math.min(100,percent));
 counter.textContent=Math.round(percent)+'%'+(total?' · '+fmt(n)+' de '+fmt(total)+' produtos':' · '+message);
}
function filtered(){
 const choice=$('ncm-filtro').value;
 if(choice==='sugestoes')return rows.filter(x=>!!x.autoSuggestion);
 if(choice==='pendentes')return rows.filter(x=>!x.correct);
 if(choice==='originais')return rows.filter(x=>!String(x.originalStatus||'').includes('vigente'));
 return rows;
}
function render(){
 shown=filtered();
 const pages=Math.max(1,Math.ceil(shown.length/SIZE));page=Math.min(page,pages-1);
 const frag=document.createDocumentFragment();
 for(const item of shown.slice(page*SIZE,page*SIZE+SIZE)){
  const tr=document.createElement('tr');
  const add=v=>{const td=document.createElement('td');td.textContent=v||'';tr.append(td)};
  add(item.productCode);add(item.description);add(item.suppliedNcm);
  const td=document.createElement('td'),input=document.createElement('input');
  input.value=item.correct||'';input.maxLength=8;input.inputMode='numeric';input.style.width='115px';
  input.placeholder='Conferir NCM';input.setAttribute('aria-label','NCM correto '+item.productCode);
  input.oninput=()=>{item.correct=input.value.replace(/\D/g,'').slice(0,8);input.value=item.correct};
  td.append(input);tr.append(td);
  const note=document.createElement('td'),strong=document.createElement('strong'),small=document.createElement('p');
  strong.textContent=item.status||'Revisão necessária';strong.style.color=item.autoSuggestion?'var(--accent)':'var(--muted)';
  small.textContent=(item.originalStatus||'')+' · '+(item.reason||'');small.className='muted';
  small.style.fontSize='12px';note.append(strong,small);tr.append(note);
  frag.append(tr);
 }
 $('ncm-sheet-table').replaceChildren(frag);
 $('ncm-pagina-info').textContent='Página '+fmt(page+1)+' de '+fmt(pages)+' — '+fmt(shown.length)+' produtos no filtro';
 $('ncm-prev').disabled=page===0;$('ncm-next').disabled=page>=pages-1;
}
function summary(){
 const total=rows.length,suggested=rows.filter(x=>x.autoSuggestion).length,valid=rows.filter(x=>String(x.originalStatus||'').includes('vigente')).length,pending=rows.filter(x=>!x.correct).length;
 const values=[['Produtos analisados',total],['Sugestões para revisão',suggested],['NCMs originais vigentes',valid],['Sem proposta segura',pending]];
 $('ncm-resumo').replaceChildren(...values.map(([label,value])=>{
  const box=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');
  box.className='ncm-summary-card';name.textContent=label;number.textContent=fmt(value);box.append(name,number);return box;
 }));
}
function stop(message){
 if(worker){worker.terminate();worker=null}
 state();status.textContent=message;
}
function workerForTask(){
 worker=new Worker('./ncm-batch-worker.js');
 worker.onerror=e=>stop('Erro no processamento: '+(e.message||'Falha no navegador'));
 worker.onmessage=e=>{
  const d=e.data||{};
  if(d.type==='phase'){update(d.label,d.percent);return}
  if(d.type==='batch'){rows.push(...d.rows);update('Analisando produtos e conferindo os NCMs...',d.percent,d.processed,d.total);return}
  if(d.type==='done'){
   complete=true;page=0;summary();render();$('ncm-sheet-result').hidden=false;
   stop('Concluído: '+fmt(d.processed)+' produtos, '+fmt(d.suggested)+' sugestões textuais para revisão. Baixe o Excel com auditoria.');
   return;
  }
  if(d.type==='exported'){
   const u=URL.createObjectURL(new Blob([d.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const a=document.createElement('a');a.href=u;a.download='fiscora-ncm-classificacao-com-auditoria.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);
   stop('Excel exportado com Classificação NCM, Auditoria e Resumo.');return;
  }
  if(d.type==='error'){stop('Falha no processamento: '+d.message)}
 };
}
$('ncm-prev').onclick=()=>{if(page>0){page--;render()}};
$('ncm-next').onclick=()=>{if((page+1)*SIZE<shown.length){page++;render()}};
$('ncm-filtro').onchange=()=>{page=0;render()};
$('ncm-modelo').onclick=()=>{
 try{const x=globalThis.XLSX,ws=x.utils.aoa_to_sheet([fields,['','','','']]),book=x.utils.book_new();
 ws['!cols']=[{wch:21},{wch:56},{wch:18},{wch:20}];x.utils.book_append_sheet(book,ws,'Classificação NCM');x.writeFile(book,'modelo-classificacao-ncm.xlsx')}
 catch(e){status.textContent='Erro no modelo: '+e.message}
};
cancel.onclick=()=>{
 if(working==='analyze'){rows=[];complete=false;$('ncm-sheet-result').hidden=true}
 stop('Operação cancelada. Você pode iniciar novamente.');
};
start.onclick=async()=>{
 if(working)return;
 const file=$('ncm-planilha-arquivo').files?.[0];if(!file){status.textContent='Selecione sua planilha de produtos.';return}
 if(file.size>MAX_FILE){status.textContent='Arquivo acima de 120 MB. Divida em partes menores.';return}
 rows=[];complete=false;$('ncm-sheet-result').hidden=true;state('analyze');update('Carregando a base oficial NCM...',1);
 await yieldUI();
 try{
  if(globalThis.fiscoraNcmReady)await globalThis.fiscoraNcmReady;
  if(working!=='analyze')return;
  const catalog=globalThis.fiscoraNcmCatalog;
  if(!Array.isArray(catalog)||!catalog.length)throw Error('Base NCM indisponível. Recarregue a página.');
  update('Preparando o processamento paralelo...',2);
  const buffer=await file.arrayBuffer();if(working!=='analyze')return;
  workerForTask();
  worker.postMessage({type:'analyze',buffer,catalog,date:globalThis.fiscoraNcmReferenceDate||'2026-11-24'},[buffer]);
 }catch(e){stop('Erro ao iniciar: '+e.message)}
};
download.onclick=async()=>{
 if(working||!complete||!rows.length)return;
 state('export');update('Preparando Excel com auditoria e resumo...',1);await yieldUI();
 try{workerForTask();worker.postMessage({type:'export',rows,date:globalThis.fiscoraNcmReferenceDate||'2026-11-24',source:'Fiscora: base oficial de 24/11/2026'});}
 catch(e){stop('Erro ao exportar: '+e.message)}
};
