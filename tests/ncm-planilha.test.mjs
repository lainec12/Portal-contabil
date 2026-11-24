import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareProducts,evaluateProduct,outputRows,createNcmIndex} from '../ncm-planilha.mjs';
import {extractNCMS} from '../ncm-classificador.mjs';
const catalog=[{code:'61091000',description:'Camisetas de algodão'},{code:'94036000',description:'Móveis de madeira'}];
test('interpreta os quatro cabeçalhos pedidos',()=>{
 const rows=prepareProducts([{'Cód. do prod':'0015','Descrição':'Camiseta algodão','NCM':'00000000','NCM correto':''}]);
 assert.equal(rows.length,1);assert.equal(rows[0].productCode,'0015');assert.equal(rows[0].suppliedNcm,'00000000');
});
test('mantém NCM original e preenche somente a coluna de sugestão',()=>{
 const row=evaluateProduct(prepareProducts([{'Cód. do prod':'P1','Descrição':'Camisetas de algodão','NCM':'00000000'}])[0],catalog);
 const out=outputRows([row])[0];
 assert.deepEqual(Object.keys(out),['Cód. do prod','Descrição','NCM','NCM correto']);
 assert.equal(out['NCM'],'00000000');assert.equal(out['NCM correto'],'61091000');
 assert.match(row.status,/revisar/i);
});
test('não inventa classificação sem correspondência suficiente',()=>{
 const row=evaluateProduct(prepareProducts([{'Cód. do prod':'P2','Descrição':'abacaxi desconhecido','NCM':'11111111'}])[0],catalog);
 assert.equal(row.correct,'');assert.equal(row.autoSuggestion,'');
});
test('respeita valor manual existente em NCM correto',()=>{
 const row=evaluateProduct(prepareProducts([{'Cód. do prod':'P3','Descrição':'Camisetas de algodão','NCM':'61091000','NCM correto':'94036000'}])[0],catalog);
 assert.equal(row.correct,'94036000');assert.equal(row.suppliedNcm,'61091000');
});

test('reconhece código de produto com ponto e espaços no cabeçalho',()=>assert.equal(prepareProducts([{'Cód. do prod':'0007','Descrição':'Teste','NCM':'12345678'}])[0].productCode,'0007'));

test('analisa lote grande sem reconstruir o índice a cada produto',()=>{
 const base=Array.from({length:10516},(_,i)=>({
  code:String(10000000+i),
  description:i===100?'Camisetas de algodão':'Item especializado '+i+' com materiais variados',
  start:'01/04/2022',end:'31/12/9999'
 }));
 const start=Date.now();
 const index=createNcmIndex(base,'2026-11-24');
 const entries=prepareProducts(Array.from({length:2500},(_,i)=>({
  'Cód. do prod':String(i+1).padStart(6,'0'),
  'Descrição':i%2?'Camisetas de algodão':'Mercadoria sem descrição identificável',
  NCM:'00000000'
 })));
 const evaluated=entries.map(p=>evaluateProduct(p,index,'2026-11-24'));
 assert.equal(evaluated.length,2500);
 assert.equal(outputRows(evaluated).length,2500);
 assert.equal(outputRows(evaluated)[0]['Cód. do prod'],'000001');
 assert.ok(index.cache.size<=2000);
 console.log('Teste de desempenho em lote NCM:',Date.now()-start,'ms para 2500 itens e 10516 códigos');
});

test('a NCM com descrição genérica herda contexto da posição',()=>{
 const list=extractNCMS({Nomenclaturas:[
 {Codigo:'87',Descricao:'Veículos automóveis e suas partes'},
 {Codigo:'87.08',Descricao:'Partes e acessórios dos veículos automóveis'},
 {Codigo:'8708.99.90',Descricao:'Outros'}
 ]});
 assert.equal(list.length,1);
 assert.match(list[0].context,/Partes e acessórios/);
});
test('suporta 100.000 produtos com índice NCM reutilizado',()=>{
 const list=Array.from({length:10516},(_,i)=>({
  code:String(11000000+i),description:i===300?'Correias de transmissão de borracha':'Item industrial '+i+' para revisão técnica',
  start:'01/04/2022',end:'31/12/9999',context:'Materiais e peças diversas'
 }));
 const index=createNcmIndex(list,'2026-11-24');
 let count=0,filled=0;
 for(let offset=0;offset<100000;offset+=250){
  const batch=prepareProducts(Array.from({length:250},(_,j)=>({
   'Cód. do prod':String(offset+j+1).padStart(6,'0'),
   'Descrição':(offset+j)%3===0?'Correias de transmissão de borracha':'Componente desconhecido '+(offset+j),
   'NCM':'11000300'
  })),offset+2);
  for(const p of batch){const r=evaluateProduct(p,index,'2026-11-24');assert.equal(r.currentExists,true);if(r.correct)filled++;count++;}
 }
 assert.equal(count,100000);
 assert.ok(filled>30000);
 assert.ok(index.cache.size<=2000);
});
