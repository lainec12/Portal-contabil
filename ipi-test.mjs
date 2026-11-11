// Teste de IPI conforme roteiro fornecido. Valores fiscais exigem revisão.
const normalized=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clean=v=>String(v??'').trim();
const digits=v=>clean(v).replace(/\D/g,'');
export const industryCfops=new Set(['1101','2101','1401','2401']);
export const wholesaleCfops=new Set(['1102','2102','1403','2403']);
export function numberBR(v){
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 let s=clean(v).replace(/R\$/gi,'').replace(/\s/g,'');
 if(!s)return null;
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 if(!/^-?\d+(?:\.\d+)?$/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
const cents=v=>Math.round((v+Number.EPSILON)*100);
const cash=c=>c/100;
export function monthKey(v){
 const s=clean(v),m=/^(\d{4})-(0[1-9]|1[0-2])(?:$|[-/])/.exec(s);
 if(m)return m[1]+'-'+m[2];
 const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const n=normalized(s);for(let i=0;i<12;i++){if(n.includes(months[i])){const y=s.match(/\b(20\d{2})\b/);if(y)return y[1]+'-'+String(i+1).padStart(2,'0');}}
 return null;
}
export function ncmCode(v){if(typeof v==='number'&&!Number.isInteger(v))return '';const s=digits(v);return s.length>0&&s.length<=8?s.padStart(8,'0'):'';}
const aliases={
 cfop:['cfop'],value:['vlitem','valordoitem'],discount:['vldesc','descontodoitem'],ncm:['ncm','codigoncm'],
 month:['mesreferencia','competencia'],doc:['numdoc','numerodanota'],item:['numitem','numerodoitem'],code:['coditem','codigodoitem'],
 supplier:['cnpj','cnpjfornecedor'],name:['nomepart','fornecedor','razaosocial'],series:['ser','serie'],date:['dtdoc','datadeemissao'],
 status:['codsit'],direction:['indoper'],description:['descritem','descricaodoitem'],ex:['exipi','extipi','ex'],
 invoiceRate:['aliqipi'],annotation:['aliquotadeipi'],key:['chvnfe']
};
const fieldFor=new Map(Object.entries(aliases).flatMap(([field,values])=>values.map(v=>[v,field])));
function location(address){const m=/^([A-Z]+)(\d+)$/.exec(address);return m?{col:m[1],row:Number(m[2])}:null;}
export function extractSheet(sheet,{file='',name='',date1904=false,stockReference=false}={}){
 const cells=Object.entries(sheet).filter(([k])=>k[0]!=='!');
 let header=0,mapping={};
 const candidates=new Map();
 for(const [address,cell] of cells){const p=location(address);if(!p||p.row>30)continue;const f=fieldFor.get(normalized(cell.v));if(f){if(!candidates.has(p.row))candidates.set(p.row,{});candidates.get(p.row)[f]=p.col;}}
 for(const [row,map] of candidates)if(map.cfop&&map.value&&map.ncm){header=row;mapping=map;break;}
 if(!header)throw new Error(file+' / '+name+': não localizei cabeçalhos CFOP, vl_item e NCM.');
 const rowIds=new Set();for(const [address] of cells){const p=location(address);if(p&&p.col===mapping.cfop&&p.row>header)rowIds.add(p.row);}
 if(rowIds.size>50000)throw new Error('Mais de 50 mil linhas na aba '+name+'. Divida o relatório.');
 const read=(f,r)=>mapping[f]?sheet[mapping[f]+r]:undefined;
 const val=(f,r)=>read(f,r)?.v;
 const items=[],issues=[],formulaRows=[],cancelled=[];
 let excluded=0,hidden=0,unsupported=0;
 for(const row of [...rowIds].sort((a,b)=>a-b)){
  const cfop=digits(val('cfop',row)),group=stockReference&&/^[12]\d{3}$/.test(cfop)?'Estoque C170':industryCfops.has(cfop)?'Indústria':wholesaleCfops.has(cfop)?'Atacadista 50%':'';
  const base={file,sheet:name,row,cfop,group,ref:file+' / '+name+'!'+row};
  if(read('cfop',row)?.f||read('value',row)?.f){formulaRows.push(base);continue;}
  if(!group){unsupported++;continue;}
  const doc=clean(val('doc',row)),item=clean(val('item',row));
  if(!doc||!item){issues.push({...base,error:'Item sem número de documento ou num_item; não incluído.'});continue;}
  const supplier=digits(val('supplier',row)).padStart(14,'0');
  const date=clean(val('date',row)),series=clean(val('series',row));
  const rawKey=val('key',row),keyText=typeof rawKey==='string'?digits(rawKey):'';
  const goodKey=keyText.length===44?keyText:'';
  if(sheet['!rows']?.[row-1]?.hidden)hidden++;
  const identity=[goodKey||supplier,goodKey?'':doc,goodKey?'':series,goodKey?'':date,item].join('|');
  const status=clean(val('status',row));
  if(status&&['02','03','04','05'].includes(status.padStart(2,'0'))){excluded++;cancelled.push({...base,identity,cancelled:true});continue;}
  if(!status){issues.push({...base,error:'Situação cadastral do documento (cod_sit) ausente; item não incluído.'});continue;}
  if(!['00','01','06','07','08'].includes(status.padStart(2,'0'))){issues.push({...base,error:'cod_sit desconhecido: '+status});continue;}
  const direction=clean(val('direction',row));if(direction&&direction!=='0'){issues.push({...base,error:'ind_oper não indica entrada; não incluído.'});continue;}
  const value=numberBR(val('value',row)),discount=mapping.discount?numberBR(val('discount',row)??0):0;
  if(value===null||discount===null||value<0||discount<0||discount>value){issues.push({...base,error:'Valor/desconto inválido. Não incluído.'});continue;}
  const month=monthKey(val('month',row));
  if(!month){issues.push({...base,error:'Competência com ano/mês ausente ou inválida. Não incluído.'});continue;}
  const ncm=ncmCode(val('ncm',row));

  const r={...base,month,doc,item,code:clean(val('code',row)),supplier:supplier==='00000000000000'?'':supplier,
    supplierName:clean(val('name',row)),description:clean(val('description',row)),ncm,ex:clean(val('ex',row)),
    gross:cents(value),discount:cents(discount),identity,annotation:val('annotation',row),invoiceRate:val('invoiceRate',row),
    numericKey:typeof rawKey==='number',hidden:!!sheet['!rows']?.[row-1]?.hidden};
  items.push(r);
 }
 return {items,issues,formulaRows,cancelled,excluded,hidden,unsupported,mapping,header};
}
export function deduplicate(items){
 const byKey=new Map(),conflicts=[],duplicates=[],cancelledKeys=new Set(items.filter(r=>r.cancelled).map(r=>r.identity));
 for(const r of items){if(cancelledKeys.has(r.identity))continue;if(!byKey.has(r.identity)){byKey.set(r.identity,r);continue;}
  const prev=byKey.get(r.identity);
  const same=['month','cfop','ncm','gross','discount','ex'].every(k=>prev[k]===r[k]);
  if(same){duplicates.push({...r,error:'Cópia de '+prev.ref});continue;}
  conflicts.push({...r,error:'Mesmo documento/item com dados divergentes de '+prev.ref});prev.conflict=true;r.conflict=true;
 }
 const cleanItems=[];for(const r of byKey.values()){if(r.conflict)conflicts.push({...r,error:'Chave de item em conflito; não incluído.'});else cleanItems.push(r);}
 return {items:cleanItems,duplicates,conflicts};
}
export function resolveRate(ncm,table,selectedEx){
 const options=table.entries[ncm];
 if(!options?.length)return {rate:null,label:'NCM não localizado',error:'NCM não encontrado na TIPI fornecida'};
 const choices=options.filter(o=>o.rate!==null);
 if(options.length>1 && selectedEx===undefined)return {rate:null,label:'Revisar Ex',error:'NCM possui Ex. Identifique padrão ou Ex antes de calcular.',options};
 const ex=selectedEx===undefined?'':selectedEx;
 const match=options.filter(o=>o.ex===ex);
 if(match.length!==1||match[0].rate===null)return {rate:null,label:'Pendente',error:'Alíquota não determinada com segurança na TIPI',options};
 const source=match[0],rate=source.rate==='NT'?'NT':numberBR(source.rate);
 if(rate===null)return {rate:null,label:'Pendente',error:'Alíquota inválida na tabela',options};
 return {rate,label:rate==='NT'?'NT':String(rate)+'%',page:source.page,description:source.description,ex,options};
}
export function predominant(rows){
 const distribution=new Map();let missing=0;
 for(const r of rows){if(r.tax.rate===null){missing++;continue;}const key=String(r.tax.rate);if(!distribution.has(key))distribution.set(key,{rate:r.tax.rate,count:0,base:0});const d=distribution.get(key);d.count++;d.base+=r.net;}
 const list=[...distribution.values()].sort((a,b)=>b.count-a.count||String(a.rate).localeCompare(String(b.rate)));
 const winners=list.filter(x=>x.count===list[0]?.count);
 return {distribution:list,missing,winners,rate:missing||winners.length!==1?null:winners[0].rate,reason:missing?'Faltam alíquotas':winners.length>1?'Empate':winners[0]?.rate==='NT'?'Predominante NT':list.length?'':'Sem itens'};
}
export function calculate(items,table,{deduct=true,exChoices={},rateChoices={},suppliers={},supplierChecks={},insumos=false}={}){
 const enriched=items.map(r=>({...r,net:r.gross-(deduct?r.discount:0),tax:resolveRate(r.ncm,table,
   Object.hasOwn(exChoices,r.ncm)?exChoices[r.ncm]:(r.ex?r.ex.padStart(2,'0'):undefined))}));
 const groups=new Map();
 for(const r of enriched){const key=r.group+'|'+r.month;if(!groups.has(key))groups.set(key,{key,group:r.group,month:r.month,candidates:[],items:[]});groups.get(key).candidates.push(r);r.cnaeIncluded=r.group!=='Atacadista 50%'||(supplierChecks[r.supplier]?.state==='Consultado'&&supplierChecks[r.supplier]?.wholesale===true);if(r.cnaeIncluded)groups.get(key).items.push(r);}
 const results=[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.group.localeCompare(b.group));
 for(const g of results){
  g.pendingCnpj=g.group==='Atacadista 50%'?g.candidates.filter(r=>supplierChecks[r.supplier]?.state!=='Consultado').length:0;
  g.excludedCnae=g.group==='Atacadista 50%'?g.candidates.filter(r=>supplierChecks[r.supplier]?.state==='Consultado'&&!supplierChecks[r.supplier]?.wholesale).length:0;
  const p=predominant(g.items);Object.assign(g,p);
  if(Object.hasOwn(rateChoices,g.key)&&!p.missing&&p.winners.some(w=>String(w.rate)===String(rateChoices[g.key]))){g.rate=rateChoices[g.key];g.choice='Desempate informado';}
  g.base=g.items.reduce((s,r)=>s+r.net,0);g.factor=g.group==='Atacadista 50%'?.5:1;
  g.adjustedBase=g.base*g.factor;
  g.simulation=typeof g.rate==='number'?Math.round(g.adjustedBase*g.rate/100):null;
  g.byItem=p.missing?null:Math.round(g.items.reduce((s,r)=>s+(typeof r.tax.rate==='number'?r.net*g.factor*r.tax.rate/100:0),0));
  g.reviewedBase=g.group==='Atacadista 50%'?g.items.filter(r=>suppliers[r.supplier]==='confirmed'&&insumos).reduce((s,r)=>s+r.net,0):null;
  g.reviewedSimulation=g.group==='Atacadista 50%'&&typeof g.rate==='number'&&insumos?Math.round(g.reviewedBase*.5*g.rate/100):null;
  g.pendingSuppliers=g.group==='Atacadista 50%'?g.items.filter(r=>suppliers[r.supplier]!=='confirmed').length:0;
 }
 return {items:enriched,groups:results};
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>c===null||c===undefined?'Pendente':cash(c).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let library;
export async function excel(){
 if(globalThis.XLSX)return globalThis.XLSX;
 if(!library)library=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/xlsx.full.min.js';s.onload=()=>resolve(globalThis.XLSX);s.onerror=()=>{library=null;reject(new Error('Leitor Excel indisponível.'));};document.head.append(s);});
 return library;
}
export function exportData(report,issues,stock,meta){
 return {
 Resumo:report.groups.map(g=>({'Competência':g.month,'Grupo':g.group,'Itens com CNAE incluído':g.items.length,'Itens pendentes CNPJ':g.pendingCnpj,'Itens sem atacado':g.excludedCnae,'Base dos itens (R$)':cash(g.base),'Fator':g.factor,
 'Alíquota predominante (%)':typeof g.rate==='number'?g.rate:g.rate??'Pendente','Base após fator (R$)':cash(g.adjustedBase),
 'Teste pelo roteiro (R$)':g.simulation===null?'Pendente':cash(g.simulation),'Teste por alíquota de cada item (R$)':g.byItem===null?'Pendente':cash(g.byItem),
 'Diferença roteiro - itens (R$)':g.simulation===null||g.byItem===null?'Pendente':cash(g.simulation-g.byItem),'Observação':g.reason||'Simulação; não autoriza crédito'})),
 Itens:report.items.map(r=>({'Arquivo':r.file,'Aba':r.sheet,'Linha':r.row,'Competência':r.month,'CFOP':r.cfop,'Nota':r.doc,'Item':r.item,
 'Fornecedor':r.supplierName,'CNPJ':r.supplier,'Incluído por CNAE':r.cnaeIncluded?'Sim':'Não / pendente','NCM':r.ncm,'Ex':r.tax.ex??'Pendente','Descrição':r.description,'Valor do item (R$)':cash(r.gross),
 'Desconto (R$)':cash(r.discount),'Base considerada (R$)':cash(r.net),'Alíquota TIPI (%)':r.tax.rate??'Pendente','Página PDF TIPI':r.tax.page??'',
 'Situação TIPI':r.tax.error||'Localizado na tabela fornecida','Alíquota anotada no relatório':r.annotation??'','Chave numérica com precisão perdida':r.numericKey?'Sim':'Não'})),
 Distribuicao:report.groups.flatMap(g=>g.distribution.map(d=>({'Competência':g.month,'Grupo':g.group,'Alíquota (%)':d.rate,'Linhas de itens':d.count,'Base (R$)':cash(d.base)}))),
 Pendencias:issues.map(r=>({'Arquivo':r.file,'Aba':r.sheet,'Linha':r.row,'Descrição':r.error})),
 Estoque:[stock],
 Fonte:[{'Arquivo TIPI':meta.file,'Edição informada':meta.edition,'SHA-256':meta.sha256,'Critério':'Uma ocorrência por linha de item; maior frequência por grupo/competência; zero e NT contam separadamente.',
 'Cálculos':'Estoque × alíquota; indústria base × alíquota; atacadista base × 50% × alíquota.',
 'Limitações':'Simulação segundo roteiro. Rever capa do livro, período da TIPI, notas e Ex; art. 227/228 do RIPI. Não soma estoque com entradas.'}]
 };
}
async function mount(){
 const host=document.getElementById('teste-ipi');if(!host)return;
 host.innerHTML='<div class="wrap"><div class="section-head"><div><span class="kicker">Roteiro de conferência · leitura local</span><h2>Teste de IPI — estoque e entradas</h2><p>Busque o IPI de cada NCM na TIPI fornecida e encontre a alíquota que aparece em mais linhas de itens.</p></div></div>'+
 '<div class="card"><h3>2. Importe os relatórios de entradas</h3><label for="ipi-files">Planilhas XLSX, XLSM ou CSV (até 15 MB por arquivo)</label><input id="ipi-files" class="field" type="file" multiple accept=".xlsx,.xlsm,.csv"><p class="fine">Reconhece os cabeçalhos mesReferencia, num_doc, num_item, vl_item, vl_desc, cfop, ncm e cod_sit, mesmo quando mudam de coluna. XLSM é lido sem executar macros. Use arquivos de uma empresa por vez.</p><div id="ipi-sheets"></div>'+
 '<p><label><input id="ipi-deduct" type="checkbox" checked> Deduzir vl_desc de vl_item na base do teste</label></p>'+
 '<div class="button-row"><button id="ipi-run" class="primary">Conferir IPI</button><button id="ipi-clear" class="field">Limpar dados</button><button id="ipi-export" class="field">Exportar conferência Excel</button></div><p id="ipi-status" role="status" aria-live="polite">Selecione os relatórios.</p>'+
 '<p id="ipi-source" class="fine">Carregando referência da TIPI…</p><p class="fine">Arquivos e dados são processados somente neste navegador. Planilhas e valores ficam neste navegador. Somente CNPJs são enviados à fonte, se você autorizar a consulta dos fornecedores; o módulo não salva os dados. Limpar remove os dados desta aba; os downloads ficam no seu aparelho.</p></div>'+
 '<div class="card" style="margin-top:16px"><h3>3. Confira os critérios e o cálculo das entradas</h3><p>A frequência conta uma ocorrência por linha de item, por grupo de CFOP e competência. Não usa quantidade comprada, valor financeiro ou média. Zero e NT são distintos. Empates, NCM ausente ou Ex não definido ficam pendentes.</p>'+
 '<p class="fine">Indústria: 1.101, 2.101, 1.401, 2.401 × alíquota. Atacadista: 1.102, 2.102, 1.403, 2.403 × 50% × alíquota. A coluna de conferência por item usa a alíquota específica de cada produto para evidenciar a diferença em relação ao roteiro.</p>'+
 '<div id="ipi-ex"></div><div id="ipi-summary" class="table-scroll" style="overflow:auto"></div><details style="margin-top:16px"><summary>Distribuição das alíquotas e itens</summary><div id="ipi-distribution"></div><div id="ipi-details" style="overflow:auto;max-height:450px"></div></details></div>'+
 '<div class="card" style="margin-top:16px"><h3>1. Estoque contábil — valor e modelo C170</h3><p class="fine">Informe o valor do estoque e envie o modelo C170 usado como referência dos produtos. A alíquota será a que aparece em mais linhas de itens dessa referência, consultada por NCM na TIPI. Este teste é separado das entradas e não será somado a elas.</p>'+
 '<div class="grid grid-3"><div class="control"><label for="ipi-stock-value">Estoque contábil (R$)</label><input id="ipi-stock-value" inputmode="decimal" placeholder="Informe o valor"></div><div class="control"><label for="ipi-stock-date">Data do estoque (opcional)</label><input id="ipi-stock-date" type="date"></div><div class="control"><label for="ipi-stock-group">Competência do C170 de referência</label><select id="ipi-stock-group" class="field"><option value="">Selecione após ler o C170</option></select></div></div><p><label for="ipi-stock-file">Planilha modelo C170 do estoque (XLSX, XLSM ou CSV)</label><input id="ipi-stock-file" class="field" type="file" accept=".xlsx,.xlsm,.csv"></p><div id="ipi-stock-sheets"></div><button id="ipi-stock-read" class="primary">Ler C170 do estoque</button><p id="ipi-stock-status" role="status">Informe o estoque e selecione o C170 de referência.</p><div id="ipi-stock-ex"></div><div id="ipi-stock-distribution" style="overflow:auto"></div><div id="ipi-stock-result" class="result">Pendente: informe o estoque contábil e leia o C170 de referência.</div></div>'+
 '<details class="card" style="margin-top:16px" open><summary><b>Consulta de CNAE e revisão dos fornecedores do teste de 50%</b></summary><p><label><input type="checkbox" id="ipi-cnpj-consent"> Autorizo enviar os CNPJs dos fornecedores à BrasilAPI / Minha Receita.</label></p><div class="button-row"><button id="ipi-cnpj-run" class="primary">Consultar CNAE dos fornecedores</button><button id="ipi-cnpj-stop" class="field" disabled>Interromper consultas</button></div><p class="fine">Somente CNPJs são enviados, sem notas ou valores. Consultas reais, sequenciais, intervalo de 2 segundos, até 100 fornecedores por execução. O teste de 50% usa apenas fornecedores consultados com atacado principal ou secundário. Representantes sem atacado e varejistas sem atacado ficam fora; erros ficam pendentes. O cadastro pode estar defasado.</p><p>CFOP e CNAE não comprovam o crédito. Para a revisão dos itens selecionados, confirme fornecedor atacadista não contribuinte do IPI e não optante pelo Simples Nacional. O destinatário deve ser industrial ou equiparado e a aquisição precisa atender aos requisitos de insumo.</p><label><input id="ipi-insumos" type="checkbox"> Revisei o enquadramento do destinatário e o uso dos itens considerados como matéria-prima, produto intermediário ou embalagem.</label><div id="ipi-suppliers"></div><p class="fine"><a href="https://www2.camara.leg.br/legin/fed/decret/2010/decreto-7212-15-junho-2010-606731-normaatualizada-pe.html" target="_blank" rel="noopener">RIPI — arts. 227 e 228</a>. O total com fornecedores confirmados continua sendo teste pelo roteiro; não é autorização de crédito nem validação automática da legislação.</p></details>'+
 '<details class="card" style="margin-top:16px"><summary>Exclusões, duplicatas e pendências</summary><div id="ipi-issues"></div><p class="fine">Canceladas/denegadas/inutilizadas são excluídas por cod_sit. Totais e células de cálculo não entram como itens. Cópias entre abas não são somadas duas vezes; conflitos exigem correção do arquivo. Linhas ocultas também são lidas e identificadas. Valores ajustados manualmente em fórmulas de soma não substituem os itens originais.</p></details>'+
 '<div class="notice" style="color:var(--text);margin-bottom:24px">O teste reproduz o roteiro informado e mostra a base dos itens. Confira com a capa do Livro de Apuração. Uma alíquota predominante não substitui a alíquota legal de cada NCM, suas notas e Ex. A TIPI fornecida é uma referência fixa e precisa corresponder à data da operação.</div></div>';
 const $=id=>host.querySelector('#ipi-'+id);
 let books=[],table=null,sourceItems=[],issues=[],report={items:[],groups:[]},suppliers={},exChoices={},rateChoices={},stock={},epoch=0,supplierChecks={},cnpjController=null,lastRequest=0,stockBooks=[],stockItems=[],stockIssues=[],stockReport={items:[],groups:[]};
 const status=s=>{$('status').textContent=s;};
 const stockCard=$('stock-value').closest('.card');host.querySelector('.wrap').insertBefore(stockCard,host.querySelector('.wrap .card'));
 function invalidate(){sourceItems=[];issues=[];report={items:[],groups:[]};suppliers={};supplierChecks={};exChoices={};rateChoices={};$('summary').textContent='Reprocesse os arquivos após alterar a seleção.';$('distribution').textContent='';$('details').textContent='';$('issues').textContent='';$('ex').textContent='';$('suppliers').textContent='';$('stock-group').innerHTML='<option value="">Selecione após conferir</option>';updateStock();}
 function tableHtml(headers,rows){return '<table class="tax-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>';}
 function updateStock(){
  const value=numberBR($('stock-value').value),date=$('stock-date').value,g=stockReport.groups.find(g=>g.key===$('stock-group').value);
  const ok=value!==null&&value>=0&&g&&typeof g.rate==='number';
  const total=ok?Math.round(cents(value)*g.rate/100):null;
  stock={'Data':date||'Não informada','Estoque contábil (R$)':value??'Não informado','Referência':g?.key||'Não selecionada','Alíquota (%)':g?.rate??'Pendente','Teste de estoque (R$)':total===null?'Pendente':cash(total),'Observação':'Teste isolado. Não somado às entradas.'};
  $('stock-result').textContent=ok?money(cents(value))+' × '+g.rate+'% = '+money(total)+' (teste do estoque).':'Pendente: informe o estoque e leia o C170; confira NCMs/Ex e selecione uma competência com alíquota definida.';
 }
 function render(){
  if(!table)return;
  stockReport=calculate(stockItems,table,{deduct:$('deduct').checked,exChoices,rateChoices});
  report=calculate(sourceItems,table,{deduct:$('deduct').checked,exChoices,rateChoices,suppliers,supplierChecks,insumos:$('insumos').checked});
  $('summary').innerHTML=tableHtml(['Competência / grupo','Itens / pendências TIPI','Base dos itens','Alíquota mais frequente','Base após fator','Teste pelo roteiro','Por alíquota de cada item','Diferença'],report.groups.map(g=>{
   let rate=typeof g.rate==='number'?g.rate+'%':g.rate==='NT'?'NT — sem taxa numérica':g.reason;
   if(!g.missing&&g.winners.length>1){rate+='<br><label>Desempatar <select class="field" data-rate="'+esc(g.key)+'"><option value="">Selecione</option>'+g.winners.map(w=>'<option value="'+esc(w.rate)+'" '+(String(rateChoices[g.key])===String(w.rate)?'selected':'')+'>'+esc(w.rate)+'</option>').join('')+'</select></label>';}
   return '<tr><td>'+esc(g.month)+'<br>'+esc(g.group)+'</td><td>'+g.items.length+' incluídos / '+g.missing+' TIPI<br>'+g.pendingCnpj+' pendentes CNPJ / '+g.excludedCnae+' sem atacado'+'</td><td>'+money(g.base)+'</td><td>'+rate+'</td><td>'+money(g.adjustedBase)+' ('+g.factor+')</td><td>'+money(g.simulation)+(g.pendingCnpj?' (parcial: faltam consultas)':'')+'</td><td>'+money(g.byItem)+'</td><td>'+money(g.simulation===null||g.byItem===null?null:g.simulation-g.byItem)+'</td></tr>';
  }));
  for(const el of $('summary').querySelectorAll('[data-rate]'))el.onchange=()=>{if(el.value==='')delete rateChoices[el.dataset.rate];else rateChoices[el.dataset.rate]=el.value==='NT'?'NT':Number(el.value);render();};
  $('distribution').innerHTML=tableHtml(['Competência / grupo','Alíquota TIPI','Linhas de itens','Base'],report.groups.flatMap(g=>g.distribution.map(d=>'<tr><td>'+esc(g.month+' / '+g.group)+'</td><td>'+esc(d.rate)+'</td><td>'+d.count+'</td><td>'+money(d.base)+'</td></tr>')));
  $('details').innerHTML=tableHtml(['Origem','Nota/item','NCM / Ex','Produto','Base','Alíquota TIPI / página','Pendência'],report.items.slice(0,1000).map(r=>'<tr><td>'+esc(r.ref)+'</td><td>'+esc(r.doc+'/'+r.item)+'</td><td>'+esc(r.ncm)+' / '+esc(r.tax.ex??'pendente')+'</td><td>'+esc(r.description)+'</td><td>'+money(r.net)+'</td><td>'+esc(r.tax.label)+' / '+esc(r.tax.page??'—')+'</td><td>'+esc(r.tax.error||'')+'</td></tr>'));
  function renderEx(items,target){
   const choices=[...new Set(items.filter(r=>r.tax.options?.length>1).map(r=>r.ncm))];
  $(target).innerHTML=choices.length?'<h4>NCMs com Ex — escolha após conferir o produto</h4>'+choices.map(ncm=>'<p><label>'+esc(ncm)+' <select class="field" data-ex="'+ncm+'"><option value="">Pendente</option>'+table.entries[ncm].map(o=>'<option value="'+(o.ex||'base')+'" '+(exChoices[ncm]===o.ex?'selected':'')+'>'+esc((o.ex?'Ex '+o.ex:'Padrão')+' · '+o.rate+'% · '+o.description.slice(0,110))+'</option>').join('')+'</select></label></p>').join(''):'';
  for(const el of $(target).querySelectorAll('[data-ex]'))el.onchange=()=>{if(!el.value)delete exChoices[el.dataset.ex];else exChoices[el.dataset.ex]=el.value==='base'?'':el.value;render();};
  }
  renderEx(report.items,'ex');renderEx(stockReport.items,'stock-ex');
  const supplierMap=new Map();for(const r of report.items.filter(r=>r.group==='Atacadista 50%'))if(!supplierMap.has(r.supplier))supplierMap.set(r.supplier,r.supplierName);
  $('suppliers').innerHTML=tableHtml(['Fornecedor / CNPJ','Consulta e evidência CNAE','Revisão dos requisitos do fornecedor'],[...supplierMap].map(([id,name])=>'<tr><td>'+esc(name)+'<br>'+esc(id||'CNPJ ausente')+'</td><td>'+esc(supplierChecks[id]?.state||'Pendente')+'<br>'+esc(supplierChecks[id]?.error||supplierChecks[id]?.category||'')+'<br>'+esc((supplierChecks[id]?.activities||[]).filter(a=>a.kind==='Atacado').map(a=>a.origin+': '+a.codigo+' '+a.descricao).join('; '))+'<br>'+esc(supplierChecks[id]?.checked||'')+'</td><td><select class="field" data-supplier="'+esc(id)+'" '+(!id?'disabled':'')+'><option value="">Pendente</option><option value="confirmed" '+(suppliers[id]==='confirmed'?'selected':'')+'>Atacadista não contribuinte IPI, fora do Simples — conferido</option><option value="excluded" '+(suppliers[id]==='excluded'?'selected':'')+'>Não atende / excluir da base revisada</option></select></td></tr>'));
  const reviewed=report.groups.filter(g=>g.group==='Atacadista 50%').map(g=>'<p>'+esc(g.month)+': base com fornecedores confirmados '+money(g.reviewedBase)+'; teste correspondente '+money(g.reviewedSimulation)+'. Itens sem fornecedor confirmado: '+g.pendingSuppliers+'.</p>').join('');
  $('suppliers').insertAdjacentHTML('beforeend',reviewed);
  for(const el of $('suppliers').querySelectorAll('[data-supplier]'))el.onchange=()=>{suppliers[el.dataset.supplier]=el.value;render();};
  const selected=$('stock-group').value;$('stock-group').innerHTML='<option value="">Selecione após conferir</option>'+stockReport.groups.map(g=>'<option value="'+esc(g.key)+'">'+esc(g.month+' · '+(g.rate??'pendente'))+'</option>').join('');$('stock-group').value=selected|| (stockReport.groups.length===1?stockReport.groups[0].key:'');updateStock();
  $('stock-distribution').innerHTML=tableHtml(['Competência C170','Alíquota TIPI','Linhas de itens'],stockReport.groups.flatMap(g=>g.distribution.map(d=>'<tr><td>'+esc(g.month)+'</td><td>'+esc(d.rate)+'</td><td>'+d.count+'</td></tr>')));
  const allIssues=[...issues,...report.items.filter(r=>r.tax.error).map(r=>({...r,error:r.tax.error})),...report.items.filter(r=>r.numericKey).map(r=>({...r,error:'Chave NF-e foi armazenada como número no Excel e perdeu precisão. Identidade usa fornecedor, nota, série, data e item.'}))];
  $('issues').innerHTML='<p>'+allIssues.length+' ocorrências. Até 500 na tela; todas na exportação.</p>'+tableHtml(['Arquivo / aba / linha','Descrição'],allIssues.slice(0,500).map(r=>'<tr><td>'+esc(r.ref||r.file+' / '+r.sheet+' / '+r.row)+'</td><td>'+esc(r.error)+'</td></tr>'));
 }
 try{const r=await fetch('./tipi-ipi.json?v=20261111');if(!r.ok)throw new Error('Não foi possível carregar a TIPI fornecida.');table=await r.json();$('source').textContent='Fonte: '+table.meta.file+' · '+table.meta.edition+'. A vigência não é atualizada automaticamente.';}catch(e){status(e.message);}
 $('files').onchange=async()=>{
  cnpjController?.abort();const token=++epoch;invalidate();books=[];$('sheets').textContent='';status('Lendo arquivos…');
  try{const lib=await excel(),files=[...$('files').files];if(!files.length){status('Selecione os relatórios.');return;}
   if(files.reduce((s,f)=>s+f.size,0)>40*1024*1024)throw new Error('O lote excede 40 MB.');
   for(const file of files){
    if(file.size>15*1024*1024)throw new Error(file.name+': excede 15 MB.');
    if(!/\.(xlsx|xlsm|csv)$/i.test(file.name))throw new Error('Use XLSX, XLSM ou CSV.');
    const csv=/\.csv$/i.test(file.name),data=csv?await file.text():await file.arrayBuffer();
    const book=lib.read(data,{type:csv?'string':'array',raw:true,cellStyles:true});if(token!==epoch)return;
    books.push({name:file.name,book});
   }
   $('sheets').innerHTML=books.map((b,i)=>{const all=b.book.SheetNames.find(n=>normalized(n)==='todososmeses');return '<fieldset style="margin-top:14px"><legend>'+esc(b.name)+'</legend>'+b.book.SheetNames.map((n,j)=>'<label style="display:inline-block;margin:6px"><input type="checkbox" data-book="'+i+'" data-sheet="'+j+'" '+(!all||all===n?'checked':'')+'> '+esc(n)+'</label>').join('')+'<p class="fine">'+(all?'TODOS OS MESES foi selecionada para evitar repetir as abas mensais. Você pode alterar a seleção.':'Abas mensais selecionadas; duplicatas serão identificadas.')+'</p></fieldset>';}).join('');
   for(const e of $('sheets').querySelectorAll('input'))e.onchange=()=>{invalidate();status('Seleção alterada. Clique em Conferir IPI.');};
   status(books.length+' arquivos lidos. Confira as abas e clique em Conferir IPI.');
  }catch(e){books=[];$('sheets').textContent='';status(e.message);}
 };
 $('run').onclick=()=>{
  try{
   if(!table)throw new Error('TIPI não carregada. Recarregue a página.');
   if(!books.length)throw new Error('Selecione os relatórios.');
   const selected=[...$('sheets').querySelectorAll('input:checked')];if(!selected.length)throw new Error('Selecione ao menos uma aba.');
   let items=[],parts=[],stats={excluded:0,hidden:0,unsupported:0,formulas:0};
   for(const el of selected){const b=books[Number(el.dataset.book)],name=b.book.SheetNames[Number(el.dataset.sheet)];const p=extractSheet(b.book.Sheets[name],{file:b.name,name});items.push(...p.items,...p.cancelled);parts.push(...p.issues);stats.excluded+=p.excluded;stats.hidden+=p.hidden;stats.unsupported+=p.unsupported;stats.formulas+=p.formulaRows.length;}
   const d=deduplicate(items);sourceItems=d.items;issues=[...parts,...d.conflicts,...d.duplicates];suppliers={};supplierChecks={};exChoices={};rateChoices={};
   if(d.conflicts.length){sourceItems=[];render();throw new Error(d.conflicts.length+' ocorrências de itens com dados divergentes. Nenhum cálculo concluído. Importe uma planilha por vez ou corrija as versões em conflito; veja as exclusões abaixo.');}
   if(!sourceItems.length)throw new Error('Nenhum item elegível para teste foi localizado. Confira CFOPs, cabeçalhos, competência e cod_sit.');
   render();status(sourceItems.length+' itens únicos; '+d.duplicates.length+' cópias ignoradas; '+d.conflicts.length+' conflitos; '+stats.excluded+' canceladas/denegadas/inutilizadas; '+stats.formulas+' linhas de fórmulas ignoradas; '+stats.hidden+' linhas ocultas lidas; '+parts.length+' pendências de importação. Resultados são testes, sujeitos à revisão.');
  }catch(e){status(e.message);}
 };
 $('deduct').onchange=()=>{render();status('Base atualizada. Confira a dedução de descontos com o relatório de origem.');};
 $('insumos').onchange=render;
 for(const id of ['stock-value','stock-date','stock-group'])$(id).oninput=updateStock;
 $('clear').onclick=()=>{cnpjController?.abort();epoch++;books=[];invalidate();$('files').value='';$('sheets').textContent='';$('stock-value').value='';$('stock-date').value='';$('stock-file').value='';$('stock-sheets').textContent='';stockBooks=[];stockItems=[];stockIssues=[];stockReport={items:[],groups:[]};$('stock-distribution').textContent='';$('stock-ex').textContent='';$('insumos').checked=false;updateStock();status('Arquivos e resultados removidos desta aba.');};
 

 $('stock-file').onchange=async()=>{
  stockBooks=[];stockItems=[];stockIssues=[];stockReport={items:[],groups:[]};render();$('stock-sheets').textContent='';
  const file=$('stock-file').files[0];if(!file)return;
  try{
   if(file.size>15*1024*1024)throw new Error('C170 excede 15 MB.');
   if(!/\.(xlsx|xlsm|csv)$/i.test(file.name))throw new Error('Use XLSX, XLSM ou CSV.');
   const lib=await excel(),csv=/\.csv$/i.test(file.name),raw=csv?await file.text():await file.arrayBuffer();
   const book=lib.read(raw,{type:csv?'string':'array',raw:true,cellStyles:true});stockBooks=[{name:file.name,book}];
   const all=book.SheetNames.find(n=>normalized(n)==='todososmeses');
   $('stock-sheets').innerHTML=book.SheetNames.map((n,i)=>'<label style="display:inline-block;margin:6px"><input type="checkbox" data-stock-sheet="'+i+'" '+(!all||n===all?'checked':'')+'> '+esc(n)+'</label>').join('');
   for(const el of $('stock-sheets').querySelectorAll('input'))el.onchange=()=>{stockItems=[];stockIssues=[];stockReport={items:[],groups:[]};render();$('stock-status').textContent='Seleção alterada. Leia novamente o C170.';};
   $('stock-status').textContent='C170 lido. Confira as abas e clique em Ler C170 do estoque.';
  }catch(e){$('stock-status').textContent=e.message;}
 };
 $('stock-read').onclick=()=>{
  try{
   if(!table)throw new Error('A TIPI ainda não carregou.');
   if(!stockBooks.length)throw new Error('Selecione a planilha modelo C170.');
   const b=stockBooks[0],checked=[...$('stock-sheets').querySelectorAll('input:checked')];if(!checked.length)throw new Error('Selecione ao menos uma aba do C170.');
   let items=[],pending=[],formulaCount=0,excluded=0;
   for(const el of checked){const n=b.book.SheetNames[Number(el.dataset.stockSheet)],p=extractSheet(b.book.Sheets[n],{file:b.name,name:n,stockReference:true});items.push(...p.items,...p.cancelled);pending.push(...p.issues);formulaCount+=p.formulaRows.length;excluded+=p.excluded;}
   const d=deduplicate(items);stockIssues=[...pending,...d.duplicates,...d.conflicts];
   if(d.conflicts.length){stockItems=[];render();throw new Error('Há itens divergentes no C170. Corrija as versões para determinar a alíquota do estoque.');}
   stockItems=d.items;if(!stockItems.length)throw new Error('Não encontrei itens de entrada no C170 selecionado.');
   render();$('stock-status').textContent=stockItems.length+' linhas únicas de itens; '+excluded+' canceladas excluídas; '+formulaCount+' fórmulas de total ignoradas; '+pending.length+' pendências de importação. Confira NCMs/Ex e a competência de referência.';
  }catch(e){$('stock-status').textContent=e.message;}
 };
 $('cnpj-stop').onclick=()=>cnpjController?.abort();
 $('cnpj-run').onclick=async()=>{
  if(cnpjController)return;
  if(!sourceItems.length){status('Importe e confira os relatórios primeiro.');return;}
  if(!$('cnpj-consent').checked){status('Autorize o envio dos CNPJs à fonte para consultar.');return;}
  const moduleUrl=document.querySelector('script[src*="cnpj-cnae.mjs"]')?.src;
  if(!moduleUrl){status('Módulo de consulta CNPJ não localizado. Recarregue o portal.');return;}
  const api=await import(moduleUrl);
  const queue=[...new Set(sourceItems.filter(r=>r.group==='Atacadista 50%').map(r=>r.supplier))].filter(id=>supplierChecks[id]?.state!=='Consultado');
  if(!queue.length){status('Não há fornecedores pendentes de consulta no grupo de 50%.');return;}
  const controller=new AbortController();cnpjController=controller;const token=epoch;
  $('cnpj-run').disabled=true;$('cnpj-stop').disabled=false;$('files').disabled=true;$('run').disabled=true;
  let done=0,limited=false;
  try{
   for(const id of queue.slice(0,100)){
    if(controller.signal.aborted||epoch!==token)break;
    if(!api.validCnpj(id)){supplierChecks[id]={state:'Inválido',error:'CNPJ ausente ou inválido. Item permanece fora da base.'};done++;render();continue;}
    const delay=Math.max(0,2000-(Date.now()-lastRequest));
    if(delay)await new Promise(resolve=>{const t=setTimeout(resolve,delay);controller.signal.addEventListener('abort',()=>{clearTimeout(t);resolve();},{once:true});});
    if(controller.signal.aborted)break;
    supplierChecks[id]={state:'Consultando'};render();lastRequest=Date.now();
    try{const result=await api.lookup(id,controller.signal);if(epoch!==token)break;supplierChecks[id]={...result,state:'Consultado'};}
    catch(e){if(epoch!==token)break;supplierChecks[id]={state:controller.signal.aborted?'Pendente':'Erro',error:controller.signal.aborted?'Interrompido.':e.name==='TimeoutError'?'Tempo esgotado.':e.message||'Falha na consulta.'};if(e.status===429){limited=true;controller.abort();}}
    done++;render();status(done+'/'+queue.length+' fornecedores processados. Somente CNAE atacadista confirmado entra no teste de 50%.');
   }
  }finally{
   cnpjController=null;$('cnpj-run').disabled=false;$('cnpj-stop').disabled=true;$('files').disabled=false;$('run').disabled=false;
   status((limited?'Limite do provedor. ':controller.signal.aborted?'Consultas interrompidas. ':'Consultas concluídas. ')+done+' processados; '+Math.max(0,queue.length-done)+' pendentes. Valores com fornecedores ainda não consultados são parciais.');render();
  }
 };
 $('export').onclick=async()=>{
  try{
   if(!report.groups.length&&!stockReport.groups.length)throw new Error('Leia o C170 do estoque ou processe os relatórios de entradas primeiro.');
   const lib=await excel(),wb=lib.utils.book_new(),extra=[...issues,...report.items.filter(r=>r.tax.error).map(r=>({...r,error:r.tax.error}))];
   const data=exportData(report,extra,stock,table.meta);const stockData=exportData(stockReport,stockIssues,stock,table.meta);data.EstoqueC170=stockData.Itens;data.EstoqueAliquotas=stockData.Distribuicao;data.Fornecedores=Object.entries(supplierChecks).map(([id,v])=>({'CNPJ':id,'Consulta':v.state,'Razão social':v.name||'','Classificação':v.category||'','Possui atacado':v.state==='Consultado'?(v.wholesale?'Sim':'Não'):'Pendente','CNAEs atacado':(v.activities||[]).filter(a=>a.kind==='Atacado').map(a=>a.origin+': '+a.codigo+' '+a.descricao).join('; '),'Consultado em':v.checked||'','Erro':v.error||'','Requisitos adicionais':suppliers[id]||'Pendente'}));for(const [name,rows] of Object.entries(data)){const ws=lib.utils.json_to_sheet(rows);ws['!cols']=Array.from({length:Object.keys(rows[0]||{}).length},()=>({wch:26}));lib.utils.book_append_sheet(wb,ws,name);}
   lib.writeFile(wb,'teste-ipi-conferencia.xlsx');
  }catch(e){status(e.message);}
 };
}
if(typeof document!=='undefined')mount().catch(console.error);
