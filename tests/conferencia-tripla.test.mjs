import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSped,parseBookRows,reconcileThree} from '../conferencia-tripla.mjs';
const key='35261112345678000123550010000000011000000019',key2='35261112345678000123550010000000021000000029',cnpj='12345678000123',period='2026-11';
const rec=(r)=>'|'+r.join('|')+'|';
const c100=(k,num,sit='00',total='100,00')=>rec(['C100','1','0','P','55',sit,'1',num,k,'10112026','10112026',total,'0','','','100,00','0','','','','100,00','18,00','0','0','0','1,65','7,60','','']);
const source=(extra=[])=>[rec(['0000','020','0','01112026','30112026','Empresa',cnpj]),c100(key,'1'),rec(['C190','000','5102','18','100,00','100,00','18,00','0','0','0','0','']),...extra,rec(['9999','5'])].join('\n');
const bookRows=[['chv_nfe','num_doc','ind_oper','cod_sit','vl_doc','cfop','cst_icms','vl_icms'],[key,'1','1','00','100,00','5102','000','18,00']];
const doc=(k=key)=>({key:k,num:'1',direction:'saida',own:true,date:'2026-11-10',status:'autorizada',values:{valor:10000,icms:1800},items:[{num:'1',cfop:'5102',cstICMS:'000',values:{valor:10000}}],analytic:[]});
test('C100 e C190 em centavos; campo ausente não vira zero',()=>{
 const r=parseSped(source(),{cnpj,period});
 assert.equal(r.docs[0].values.valor,10000);
 assert.equal(r.docs[0].values.icms,1800);
 assert.equal(r.docs[0].values.cofins,760);
 assert.equal(r.docs[0].analytic[0].cfop,'5102');
 assert.equal(r.docs[0].analytic[0].values.bcICMS,10000);
 assert.throws(()=>parseSped(source(),{cnpj:'00000000000000',period}),/CNPJ/);
 assert.throws(()=>parseSped(source(),{cnpj,period:'2026-10'}),/Competência/);
});
test('Livro por chave conserva campos sem valor',()=>{
 const book=parseBookRows(bookRows);
 assert.equal(book.docs[0].values.icms,1800);
 assert.equal(book.docs[0].values.pis,null);
});
test('duplicados não somam duas vezes, cancelamentos não somam, ausência é listada',()=>{
 const sped=parseSped(source([c100(key2,'2','02','300,00')]),{cnpj,period});
 const xml={docs:[doc(),doc()],events:[],issues:[]};
 const book=parseBookRows(bookRows);
 const r=reconcileThree({xml,sped,book,period});
 assert.equal(r.totals.find(t=>t.direction==='saida').xml,10000);
 assert.equal(r.totals.find(t=>t.direction==='saida').sped,10000);
 assert.ok(r.issues.some(i=>i.type==='Duplicidade'&&i.key===key));
 assert.ok(r.issues.some(i=>i.type==='Documento ausente'&&i.key===key2));
 assert.ok(r.issues.some(i=>i.type==='Cancelada'&&i.key===key2));
});
test('compara ICMS, CFOP e CST, mas P9 não simula ausência de notas',()=>{
 const sped=parseSped(source(),{cnpj,period});
 const x=doc();x.values.icms=1700;x.items[0].cfop='6102';x.items[0].cstICMS='060';
 const r=reconcileThree({xml:{docs:[x],events:[]},sped,book:{totals:[{period,direction:'saida',amount:9000}]},period});
 assert.ok(r.issues.some(i=>i.field==='ICMS'&&i.type==='Valor/base divergente'));
 assert.ok(r.issues.some(i=>i.field==='CFOP'&&i.type==='Classificação divergente'));
 assert.ok(r.issues.some(i=>i.field==='CST/CSOSN ICMS'));
 assert.equal(r.totals.find(t=>t.direction==='saida').spedBook,-1000);
 assert.ok(!r.issues.some(i=>i.source==='Livro'&&i.type==='Documento ausente'));
});
test('cancelamento homologado vinculado à chave exclui XML do total',()=>{
 const sped=parseSped(source(),{cnpj,period});
 const r=reconcileThree({xml:{docs:[doc()],events:[key]},sped,book:parseBookRows(bookRows),period});
 assert.equal(r.totals.find(t=>t.direction==='saida').xml,0);
 assert.ok(r.issues.some(i=>i.type==='Situação divergente'));
});
test('documentos sem chave não são associados por número',()=>{
 const book=parseBookRows([bookRows[0],['','1','1','00','100,00']]);
 assert.ok(book.issues.some(i=>i.type==='Chave ausente/inválida'));
});
