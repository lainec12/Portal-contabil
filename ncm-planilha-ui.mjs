import {prepareProducts,evaluateProduct,outputRows} from './ncm-planilha.mjs';
const $=id=>document.getElementById(id);
const fields=['Cód. do prod','Descrição','NCM','NCM correto'];
const escape = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]));
let analyses=[];
const status=$('ncm-sheet-status');
function workbook(){if(!globalThis.XLSX)throw Error('Biblioteca Excel indisponível. Atualize a página e tente novamente.');return globalThis.XLSX}
function downloadXlsx(rows,file){
 const x=workbook();
 const ws=x.utils.json_to_sheet(rows,{header:fields});
 ws['!cols']=[{wch:21},{wch:54},{wch:17},{wch:20}];
 const wb=x.utils.book_new();x.utils.book_append_sheet(wb,ws,'Classificação NCM');
 x.writeFile(wb,file);
}
$('ncm-modelo').addEventListener('click',()=>downloadXlsx([Object.fromEntries(fields.map(k=>[k,'']))],'modelo-classificacao-ncm.xlsx'));
$('ncm-importar').addEventListener('click',async()=>{
 const file=$('ncm-planilha-arquivo').files?.[0],catalog=globalThis.fiscoraNcmCatalog;
 if(!file){status.textContent='Selecione a planilha de produtos.';return;}
 if(!Array.isArray(catalog)||!catalog.length){status.textContent='Carregue primeiro a tabela NCM oficial, no campo acima.';return;}
 try{
  if(file.size>15e6)throw Error('Planilha maior que 15 MB.');
  const x=workbook();const w=x.read(await file.arrayBuffer(),{type:'array',cellDates:false});
  const sheet=w.Sheets[w.SheetNames[0]];
  if(!sheet)throw Error('A planilha não contém nenhuma aba.');
  const rows=x.utils.sheet_to_json(sheet,{defval:'',raw:false});
  if(rows.length>10000)throw Error('Mais de 10.000 produtos. Divida a planilha em lotes.');
  const products=prepareProducts(rows);
  if(!products.length)throw Error('Nenhum produto com código, descrição ou NCM. Confira os cabeçalhos.');
  analyses=products.map(p=>evaluateProduct(p,catalog));
  const tbody=$('ncm-sheet-table');
  tbody.replaceChildren(...analyses.map((p,i)=>{
    const tr=document.createElement('tr');
    const add=v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);};
    add(p.productCode);add(p.description);add(p.suppliedNcm);
    const cell=document.createElement('td'),input=document.createElement('input');
    input.type='text';input.value=p.correct;input.maxLength=10;input.placeholder='Revisar NCM';
    input.setAttribute('aria-label','NCM correto do produto '+(p.productCode||p.row));
    input.style.minWidth='105px';input.style.width='115px';
    input.addEventListener('input',()=>{p.correct=input.value.replace(/\D/g,'').slice(0,8);input.value=p.correct;});
    cell.append(input);tr.append(cell);
    add(p.status+(p.match!==null?' ('+p.match+'% correspondência textual)':''));
    return tr;
  }));
  $('ncm-sheet-result').hidden=false;
  const suggestions=analyses.filter(p=>p.autoSuggestion).length;
  status.textContent=analyses.length+' produtos importados. '+suggestions+' sugestões textuais preenchidas em NCM correto; os demais permanecem em branco para revisão.';
 }catch(e){analyses=[];$('ncm-sheet-result').hidden=true;status.textContent='Falha na planilha: '+e.message;}
});
$('ncm-baixar').addEventListener('click',()=>{
 if(!analyses.length)return;
 const rows=outputRows(analyses);
 downloadXlsx(rows,'classificacao-ncm-revisao.xlsx');
});
