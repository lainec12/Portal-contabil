import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMoney,analyzeOperation,calculatePisCofins} from '../pis-cofins.mjs';
test('interpreta moeda brasileira e rejeita valores negativos',()=>{
 assert.equal(parseMoney('R$ 1.234,56'),1234.56);
 assert.equal(parseMoney('1200.34'),1200.34);
 assert.throws(()=>parseMoney('-5'),/inválido/i);
});
test('reproduz exemplo aritmético enviado de saída e crédito não cumulativo',()=>{
 const r=calculatePisCofins({regime:'nao-cumulativo',period:'2026-10',operations:[
  {type:'saida',category:'tributado',value:227900.03,icms:32431.71,description:'Saídas tributadas'},
  {type:'entrada',category:'tributado',value:324291.03,icms:28959.58,creditEligible:true,description:'Compras elegíveis informadas'}
 ]});
 assert.equal(r.debit.base,195468.32);assert.equal(r.debit.pis,3225.23);assert.equal(r.debit.cofins,14855.59);
 assert.equal(r.credit.base,295331.45);assert.equal(r.credit.pis,4872.97);assert.equal(r.credit.cofins,22445.19);
 assert.equal(r.pisCredit,1647.74);assert.equal(r.cofinsCredit,7589.60);
});
test('não presume créditos sobre entradas não revisadas',()=>{
 const r=calculatePisCofins({regime:'nao-cumulativo',period:'2026-11',operations:[
 {type:'entrada',category:'tributado',value:1000,icms:180,creditEligible:false},
 {type:'entrada',category:'monofasico',value:150,icms:0,creditEligible:true},
 {type:'saida',category:'monofasico',value:500,icms:0},
 {type:'saida',category:'zero',value:200,icms:0}
 ]});
 assert.equal(r.credit.pis,0);assert.equal(r.credit.cofins,0);assert.equal(r.debit.pis,0);assert.equal(r.debit.cofins,0);
});
test('cumulativo: alíquotas reduzidas e sem crédito',()=>{
 const r=calculatePisCofins({regime:'cumulativo',period:'2026-11',operations:[
 {type:'saida',category:'tributado',value:1000,icms:0},
 {type:'entrada',category:'tributado',value:1000,icms:0,creditEligible:true}
 ]});
 assert.equal(r.debit.pis,6.5);assert.equal(r.debit.cofins,30);assert.equal(r.credit.pis,0);
});
test('Simples não simula DAS',()=>{
 const r=calculatePisCofins({regime:'simples',period:'2026-11',operations:[
 {type:'saida',category:'tributado',value:1000,icms:0}
 ]});
 assert.equal(r.debit.pis,0);assert.equal(r.debit.cofins,0);
});
test('classificação não confirmada fica fora da apuração',()=>{
 const r=calculatePisCofins({regime:'nao-cumulativo',period:'2026-11',operations:[
 {type:'saida',category:'revisao',value:1000,icms:0}
 ]});
 assert.equal(r.pending,1);assert.equal(r.debit.pis,0);
});
test('não aceita ICMS maior que operação',()=>assert.throws(()=>analyzeOperation({type:'saida',category:'tributado',value:10,icms:20},'nao-cumulativo'),/ICMS superior/));
