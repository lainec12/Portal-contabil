import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCredit, apuracaoAssistida, auditXml } from '../fiscal-analysis.mjs';
const base={regime:'real',periodo:'2026-10',receita:10000,icmsDebito:1200,icmsCredito:300,pisDebito:160,pisCredito:50,cofinsDebito:760,cofinsCredito:200,outros:0,validado:true};
test('saldo com créditos conferidos',()=>{const r=apuracaoAssistida(base);assert.equal(r.icms.recolher,900);assert.equal(r.pis.recolher,110);assert.equal(r.cofins.recolher,560)});
test('créditos informados aparecem como simulação, sem validação obrigatória',()=>{const r=apuracaoAssistida({...base,validado:false});assert.equal(r.icms.credito,300);assert.match(r.status,/SIMULAÇÃO/)});
test('simples não apropria créditos de XML',()=>{const r=apuracaoAssistida({...base,regime:'simples'});assert.equal(r.icms.credito,0);assert.match(r.observacoes,/PGDAS-D/)});
test('não trata imposto de saída como crédito',()=>{assert.equal(classifyCredit({regime:'real',direction:'Saída'}).status,'não é crédito de entrada')});
test('exige validação na entrada do lucro real',()=>{assert.equal(classifyCredit({regime:'real',direction:'Entrada',cfop:'1102'}).status,'revisão obrigatória')});
test('auditoria remove duplicados e cancelados',()=>{const key='1'.repeat(44);const k2='2'.repeat(44);const r=auditXml({notes:[{key,type:'Entrada',month:'2026-10',value:150},{key,type:'Entrada',month:'2026-10',value:150},{key:k2,type:'Saída',month:'2026-10',value:200}],events:[{key:k2,code:'110111',accepted:true}]});assert.equal(r.entradas.valor,150);assert.equal(r.saidas.valor,0);assert.equal(r.cancelados,1);assert.equal(r.issues.length,1)});
test('rejeita valores negativos',()=>assert.throws(()=>apuracaoAssistida({...base,icmsCredito:-2})));

test('Lucro Presumido não aplica créditos típicos não cumulativos de PIS/COFINS',()=>{const r=apuracaoAssistida({...base,regime:'presumido'});assert.equal(r.icms.credito,300);assert.equal(r.pis.credito,0);assert.equal(r.cofins.credito,0);assert.equal(r.creditoInformadoNaoAplicado,250);assert.match(r.observacoes,/cumulativo/)});
