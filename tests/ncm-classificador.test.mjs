import assert from 'node:assert/strict';
import test from 'node:test';
import {extractNCMS,suggest,score} from '../ncm-classificador.mjs';
test('extrai códigos válidos em objeto aninhado',()=>{
 const r=extractNCMS({data:{lista:[{codigo:'6109.10.00',descricao:'Camisetas de algodão'},{codigo:'123',descricao:'Grupo'},{Codigo:'9403.60.00',Descricao:'Móveis de madeira'}]}});
 assert.equal(r.length,2);assert.equal(r[0].code,'61091000');
});
test('sugere correspondência por descrição sem confirmar classificação',()=>{
 const r=suggest('camiseta algodao',[{code:'61091000',description:'Camisetas de algodão'},{code:'94036000',description:'Móveis de madeira'}]);
 assert.equal(r[0].code,'61091000');assert.ok(r[0].match>0);
});
test('busca código por prefixo',()=>{
 const list=[{code:'61091000',description:'Camisetas de algodão'},{code:'94036000',description:'Móveis de madeira'}];
 assert.equal(suggest('6109',list)[0].code,'61091000');
});
test('termo sem correspondência retorna zero',()=>assert.equal(score('abacaxi','Móveis de madeira'),0));
