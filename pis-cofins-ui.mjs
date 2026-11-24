import {calculatePisCofins,analyzeOperation,parseMoney} from './pis-cofins.mjs';
const $=id=>document.getElementById(id);
const brl=n=>Number(n??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]));
let operations=[],lastReport=null;
try{document.documentElement.dataset.theme=localStorage.getItem('contaclara_theme')==='dark'?'dark':'light'}catch(_){}
function renderItems() {
 $('items').replaceChildren(...operations.map((item,index)=>{
  const tr=document.createElement('tr');
  for(const value of [item.type,item.category,(item.document||'')+' — '+(item.description||''),brl(parseMoney(item.value)),brl(parseMoney(item.icms)),item.creditEligible?'Sim':'Não']){
   const cell=document.createElement('td');cell.textContent=value;tr.append(cell);
  }
  const cell=document.createElement('td'),button=document.createElement('button');
  button.type='button';button.className='secondary';button.textContent='Excluir';button.setAttribute('aria-label','Excluir operação '+(index+1));
  button.onclick=()=>{operations.splice(index,1);lastReport=null;$('report').style.display='none';renderItems();};cell.append(button);tr.append(cell);
  return tr;
 }));
 $('status').textContent=operations.length?operations.length+' operações cadastradas. Gere a memória para calcular.':'Nenhuma operação incluída.';
}
function itemForm(){
 return {type:$('type').value,category:$('category').value,document:$('document').value.trim(),description:$('description').value.trim(),
 ncm:$('ncm').value.replace(/\D/g,''),cst:$('cst').value.replace(/\D/g,''),
 value:parseMoney($('value').value),icms:parseMoney($('icms').value),creditEligible:$('eligible').checked};
}
$('op-form').onsubmit=e=>{
 e.preventDefault();
 try{const item=itemForm();analyzeOperation(item,$('regime').value);operations.push(item);renderItems();$('value').value='';$('description').value='';$('document').value='';$('ncm').value='';$('cst').value='';$('eligible').checked=false;}catch(err){$('status').textContent='Erro: '+err.message;}
};
$('clear').onclick=()=>{
 if(!operations.length)return;
 operations=[];lastReport=null;$('report').style.display='none';renderItems();
};
function workbook(){if(!window.XLSX)throw new Error('Leitor Excel não disponível');return window.XLSX;}
function parseRow(row) {
 const fields=Object.fromEntries(Object.entries(row).map(([k,v])=>[String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''),String(v??'').trim()]));
 const tr=(fields.tratamento||fields.classificacao||'revisao').toLowerCase();
 const category=/monofas/.test(tr)?'monofasico':/zero/.test(tr)?'zero':/tributad/.test(tr)?'tributado':'revisao';
 const t=(fields.tipo||fields.operacao||'').toLowerCase();
 const type=/entr|compr/.test(t)?'entrada':/said|vend/.test(t)?'saida':'';
 if(!type)throw Error('Tipo de operação desconhecido: '+t);
 const explicitCredit=/^(sim|s|yes|true|1)$/i.test(fields.creditoelegivel||fields.credito||'');
 const value=parseMoney(fields.valor||fields.valoroperacao||'0');
 const icms=parseMoney(fields.icms||fields.icmsdestacado||'0');
 return {type,category,document:fields.documento||fields.nf||'',description:fields.descricao||fields.produto||'',ncm:(fields.ncm||'').replace(/\D/g,''),cst:(fields.cst||'').replace(/\D/g,''),value,icms,creditEligible:explicitCredit};
}
$('import').onclick=async()=>{
 const file=$('file').files?.[0];
 if(!file){$('file-status').textContent='Selecione a planilha.';return;}
 try{
  if(file.size>15e6)throw Error('Planilha maior que 15 MB.');
  const x=workbook(),wb=x.read(await file.arrayBuffer(),{type:'array',raw:false});
  const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw Error('Planilha sem aba.');
  const raw=x.utils.sheet_to_json(sheet,{raw:false,defval:''});
  if(raw.length>10000)throw Error('Mais de 10.000 linhas. Divida em lotes.');
  const parsed=raw.map((r,i)=>{try{return parseRow(r)}catch(e){throw Error('Linha '+(i+2)+': '+e.message)}});
  for(const item of parsed)analyzeOperation(item,$('regime').value);
  operations.push(...parsed);renderItems();$('file-status').textContent=parsed.length+' operações importadas. Classificações especiais permanecem para revisão.';
 }catch(err){$('file-status').textContent='Importação não concluída: '+err.message;}
};
$('model').onclick=()=>{
 try{const x=workbook(),rows=[{'TIPO':'saida','TRATAMENTO':'tributado','DOCUMENTO':'NF-Exemplo','DESCRICAO':'Mercadoria exemplo','NCM':'','CST':'01','VALOR':'1000,00','ICMS':'180,00','CREDITO_ELEGIVEL':'NÃO'}];const ws=x.utils.json_to_sheet(rows),wb=x.utils.book_new();ws['!cols']=[{wch:14},{wch:19},{wch:17},{wch:32},{wch:15},{wch:12},{wch:17},{wch:14},{wch:24}];x.utils.book_append_sheet(wb,ws,'Operações');x.writeFile(wb,'modelo-pis-cofins-fiscora.xlsx');}catch(e){$('file-status').textContent=e.message;}
};
function addMetric(target,label,value){
 const div=document.createElement('div');div.className='metric';
 const t=document.createElement('span');t.textContent=label;const v=document.createElement('b');v.textContent=brl(value);div.append(t,v);target.append(div);
}
function renderReport(result) {
 $('report-info').textContent='Empresa: '+(result.company||'Não informada')+' | Competência: '+result.period+' | Regime: '+result.regime+' | Gerado em: '+new Date().toLocaleString('pt-BR');
 const metrics=$('metrics');metrics.replaceChildren();
 addMetric(metrics,'Débito PIS',result.debit.pis);addMetric(metrics,'Crédito PIS indicativo',result.credit.pis);
 addMetric(metrics,'Saldo PIS a recolher indicativo',result.pisPayable);addMetric(metrics,'Saldo credor PIS indicativo',result.pisCredit);
 addMetric(metrics,'Débito COFINS',result.debit.cofins);addMetric(metrics,'Crédito COFINS indicativo',result.credit.cofins);
 addMetric(metrics,'Saldo COFINS a recolher indicativo',result.cofinsPayable);addMetric(metrics,'Saldo credor COFINS indicativo',result.cofinsCredit);
 const formula=$('formulas');formula.replaceChildren();
 const lines=[
  'Valor das operações de saída: '+brl(result.debit.amount)+' | Bases normais tributadas: '+brl(result.debit.base),
  'Valor das operações de entrada: '+brl(result.credit.amount)+' | Bases de créditos confirmados e elegíveis: '+brl(result.credit.base),
  'PIS = '+brl(result.debit.pis)+' (débito) − '+brl(result.credit.pis)+' (crédito) = '+brl(result.pisBalance)+' (saldo)',
  'COFINS = '+brl(result.debit.cofins)+' (débito) − '+brl(result.credit.cofins)+' (crédito) = '+brl(result.cofinsBalance)+' (saldo)'
 ];
 for(const line of lines){const p=document.createElement('p');p.className='report-line';p.textContent=line;formula.append(p);}
 const body=$('detail');body.replaceChildren(...result.detailed.map(r=>{
  const tr=document.createElement('tr');
  const note=(r.document||r.description||'Operação '+r.index)+' — '+(r.description||'');
  const data=[note,r.type,r.category,brl(r.base),brl(r.pis),brl(r.cofins),r.note+' | Fórmula: '+brl(r.value)+' − '+brl(r.icms)+' ICMS = '+brl(r.base)+' (base demonstrativa)'];
  for(const v of data){const td=document.createElement('td');td.textContent=v;tr.append(td);}return tr;
 }));
 const warnings=$('warning-list');warnings.replaceChildren();
 const notes=[];
 if(result.pending)notes.push(result.pending+' operação(ões) com classificação especial ou indefinida não calculadas automaticamente.');
 if(result.regime==='simples')notes.push('Simples Nacional: os campos zero não representam apuração ou DAS. Usar segregação de receitas no PGDAS-D.');
 if(result.detailed.some(r=>r.type==='entrada'&&r.category==='tributado'&&!r.creditEligible))notes.push('Há entradas tributadas sem elegibilidade de crédito confirmada; o crédito não foi aproveitado.');
 for(const r of result.detailed){
  const c=String(r.cst||'').padStart(2,'0'),wanted=r.category==='monofasico'?'04':r.category==='zero'?'06':r.category==='tributado'?'01':'';
  if(r.type==='saida' && c && wanted && c!==wanted)notes.push('Operação '+r.index+': CST informado '+c+' pode divergir do tratamento '+r.category+' (CST '+wanted+' usual); conferir EFD.');
 }
 notes.push(result.notes);
 for(const txt of notes){const p=document.createElement('p');p.textContent='• '+txt;warnings.append(p);}
 $('report').style.display='block';
}
$('calculate').onclick=()=>{
 try{lastReport=calculatePisCofins({regime:$('regime').value,period:$('period').value,company:$('company').value.trim(),operations});renderReport(lastReport);$('report').scrollIntoView({behavior:'smooth',block:'start'});}catch(err){$('status').textContent='Não foi possível calcular: '+err.message;}
};
$('print').onclick=()=>{if(lastReport)window.print()};
const download=(content,name,type)=>{
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('export-csv').onclick=()=>{
 if(!lastReport)return;
 const rows=[['Tipo','Tratamento','Documento','Descrição','NCM','CST','Valor','ICMS','Crédito revisado','Base','PIS','COFINS','Observação'],...lastReport.detailed.map(x=>[x.type,x.category,x.document,x.description,x.ncm,x.cst,x.value,x.icms,x.creditEligible?'SIM':'NÃO',x.base,x.pis,x.cofins,x.note])];
 download('\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n'),'pis-cofins-itens-'+lastReport.period+'.csv','text/csv;charset=utf-8');
};
$('export-json').onclick=()=>{
 const data={format:'fiscora-pis-cofins',version:1,exportedAt:new Date().toISOString(),company:$('company').value,period:$('period').value,regime:$('regime').value,operations};
 download(JSON.stringify(data,null,2),'pis-cofins-sessao-'+data.period+'.json','application/json');
};
$('import-json').onchange=async()=>{
 const file=$('import-json').files?.[0];if(!file)return;
 try{
  if(file.size>2e6)throw Error('Arquivo maior que 2MB.');
  const d=JSON.parse(await file.text());
  if(d?.format!=='fiscora-pis-cofins'||d.version!==1||!Array.isArray(d.operations)||d.operations.length>10000)throw Error('Arquivo de sessão incompatível.');
  const result=calculatePisCofins({regime:d.regime,period:d.period,company:String(d.company||''),operations:d.operations});
  $('regime').value=result.regime;$('period').value=result.period;$('company').value=result.company;
  operations=d.operations.map(x=>({...x}));renderItems();lastReport=result;renderReport(result);
  $('status').textContent='Sessão restaurada e demonstrativo recalculado.';
 }catch(err){$('status').textContent='Falha ao reabrir sessão: '+err.message;}
 finally{$('import-json').value='';}
};
renderItems();
