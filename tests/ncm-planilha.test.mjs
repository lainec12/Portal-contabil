import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareProducts,evaluateProduct,outputRows} from '../ncm-planilha.mjs';
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
