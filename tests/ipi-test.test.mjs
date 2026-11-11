import assert from 'node:assert/strict';
import {numberBR,monthKey,ncmCode,resolveRate,predominant,extractSheet,deduplicate,calculate,exportData} from '../ipi-test.mjs';
assert.equal(numberBR('1.234,56'),1234.56);assert.equal(numberBR('3.25'),3.25);assert.equal(numberBR(''),null);
assert.equal(monthKey('Março de 2026'),'2026-03');assert.equal(monthKey('2026-02'),'2026-02');assert.equal(monthKey('Março'),null);
assert.equal(ncmCode('6802.23.00'),'68022300');assert.equal(ncmCode(1012100),'01012100');
const table={meta:{},entries:{'68022300':[{ex:'',rate:'3,25',page:1,description:'Pedra'}],'82075011':[{ex:'',rate:'5,2',page:2,description:'Ferramenta'}],'99999999':[{ex:'',rate:'NT',page:3}], '11111111':[{ex:'',rate:'0',page:4},{ex:'01',rate:'5',page:4}]}};
assert.equal(resolveRate('68022300',table).rate,3.25);
assert.equal(resolveRate('11111111',table).rate,null);
assert.equal(resolveRate('11111111',table,'').rate,0);
assert.equal(resolveRate('11111111',table,'01').rate,5);
assert.equal(resolveRate('00000000',table).rate,null);
const headers=['mesReferencia','num_doc','num_item','vl_item','vl_desc','cfop','ncm','cod_sit','cnpj','ser','dt_doc','ind_oper'];
function sheet(rows){const s={};headers.forEach((v,i)=>s[String.fromCharCode(65+i)+'1']={v});rows.forEach((r,j)=>r.forEach((v,i)=>s[String.fromCharCode(65+i)+(j+2)]={v}));return s;}
const source=sheet([
 ['Janeiro de 2026',1,1,100,10,1101,68022300,0,'11222333000181',1,46000,0],
 ['Janeiro de 2026',1,2,200,0,1101,68022300,0,'11222333000181',1,46000,0],
 ['Janeiro de 2026',2,1,1000,0,1101,82075011,0,'11222333000181',1,46000,0],
 ['Janeiro de 2026',3,1,900,0,1101,68022300,2,'11222333000181',1,46000,0],
 ['Janeiro de 2026',4,1,900,0,5102,68022300,0,'11222333000181',1,46000,1],
 ['Janeiro de 2026',5,1,100,0,1102,68022300,0,'11222333000181',1,46000,0]
]);
source['XFD1']={v:'Coluna16320'};source['D8']={v:300,f:'SUM(D2:D7)'};source['F8']={v:1101};source['!ref']='A1:XFD99999';
const parsed=extractSheet(source,{file:'teste.xlsx',name:'Entradas'});
assert.equal(parsed.items.length,4);assert.equal(parsed.excluded,1);assert.equal(parsed.formulaRows.length,1);
const d=deduplicate([...parsed.items,...parsed.items.map(r=>({...r,ref:'cópia'}))]);assert.equal(d.items.length,4);assert.equal(d.duplicates.length,4);
const supplierChecks={'11222333000181':{state:'Consultado',wholesale:true}};
const pending=calculate(d.items,table);assert.equal(pending.groups.find(g=>g.group==='Atacadista 50%').simulation,null);
const retail=calculate(d.items,table,{supplierChecks:{'11222333000181':{state:'Consultado',wholesale:false}}});assert.equal(retail.groups.find(g=>g.group==='Atacadista 50%').excludedCnae,1);
const r=calculate(d.items,table,{supplierChecks});
const industry=r.groups.find(g=>g.group==='Indústria');assert.equal(industry.rate,3.25);assert.equal(industry.base,129000);assert.equal(industry.simulation,4193);assert.equal(industry.byItem,6143);
const wholesale=r.groups.find(g=>g.group==='Atacadista 50%');assert.equal(wholesale.simulation,163);assert.equal(wholesale.reviewedSimulation,null);
const checked=calculate(d.items,table,{supplierChecks,insumos:true,suppliers:{'11222333000181':'confirmed'}});assert.equal(checked.groups.find(g=>g.group==='Atacadista 50%').reviewedSimulation,163);
assert.equal(deduplicate([parsed.items[0],{identity:parsed.items[0].identity,cancelled:true}]).items.length,0);
const tie=predominant([{tax:{rate:0},net:100},{tax:{rate:3.25},net:100}]);assert.equal(tie.rate,null);assert.equal(tie.winners.length,2);
assert.equal(predominant([{tax:{rate:3.25},net:100},{tax:{rate:null},net:100}]).rate,null);
const conflicted=deduplicate([parsed.items[0],{...parsed.items[0],gross:999}]);assert.equal(conflicted.items.length,0);
assert.equal(exportData(r,[],{},{}).Itens[0]['Alíquota TIPI (%)'],3.25);
const stockSource=sheet([['Janeiro de 2026',9,1,100,0,1556,82075011,0,'11222333000181',1,46000,0]]);
assert.equal(extractSheet(stockSource).items.length,0);
const stockParsed=extractSheet(stockSource,{stockReference:true});
assert.equal(stockParsed.items[0].group,'Estoque C170');
const stockResult=calculate(stockParsed.items,table);assert.equal(stockResult.groups[0].rate,5.2);assert.equal(stockResult.groups[0].items.length,1);
console.log('IPI: CFOPs, base por item/desconto, moda por frequência, TIPI/Ex/NT, duplicatas, conflitos e fatores OK');
