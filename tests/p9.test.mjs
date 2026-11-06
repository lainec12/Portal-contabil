import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
// Execute the actual production functions, without duplicating the parser.
const names=['normalizeText','parseBookAmount','textLinesFromItems','parseP9Page','readFiscalBookPdf','compareXmlToP9'];
const ctx=vm.createContext({Uint8Array,xmlBookStatus:{},xmlBookDirection:{value:'auto'},xmlReport:[]});
for(const name of names)vm.runInContext(html.match(new RegExp('  (?:async )?function '+name+'[^\\n]+'))[0],ctx);
vm.runInContext(html.slice(html.indexOf('  function p9HeaderPeriods'),html.indexOf('  function parseP9Page')),ctx);
const expected=[['2026-08','entrada',34202.97],['2026-08','saida',56514.24],['2026-09','entrada',41012.11],['2026-09','saida',64149.99],['2026-10','entrada',32681.96],['2026-10','saida',52702.11]];
const pages=JSON.parse(fs.readFileSync(new URL('tests/p9-pages.json',root),'utf8'));
const summary=parsed=>parsed.flatMap(p=>p.totals).map(t=>[t.competencia,t.direction,t.valorContabil]);
assert.deepEqual(JSON.parse(JSON.stringify(summary(pages.map(ctx.parseP9Page)))),expected);
assert.deepEqual(pages.map(p=>ctx.parseP9Page(p).competencia),['2026-08','2026-08','2026-09','2026-09','2026-10','2026-10']);
const header=text=>({y:740,text,items:[{x:326,str:text}]});
const page=lines=>({number:1,lines});
assert.throws(()=>ctx.parseP9Page(page([header('Constituição: 16/04/2012')])),/não identifiquei/);
assert.throws(()=>ctx.parseP9Page(page([header('Mês ou Período / Ano: 16/04/2012')])),/não identifiquei/);
assert.throws(()=>ctx.parseP9Page(page([header('Mês ou Período / Ano: 13/2026')])),/não identifiquei/);
assert.throws(()=>ctx.parseP9Page(page([header('Mês ou Período / Ano: 08/2026'),header('Competência: 09/2026')])),/conflitantes/);
assert.equal(ctx.parseP9Page(page([header('Constituição: 16/04/2012'),header('Mês ou Período / Ano: 08/2026')])).competencia,'2026-08');
assert.equal(ctx.parseP9Page(page([header('Mês ou Período / Ano:'),{y:726,text:'08 / 2026',items:[{x:453,str:'08'},{x:470,str:'/'},{x:480,str:'2026'}]}])).competencia,'2026-08');
assert.equal(ctx.parseP9Page(page([header('Competência: 9 / 2026')])).competencia,'2026-09');
assert.equal(ctx.parseBookAmount('1.234,56'),1234.56);
// Comparison keeps months/directions separate and excludes duplicate/cancelled notes.
const book={totals:pages.flatMap(p=>ctx.parseP9Page(p).totals),ownCnpj:'12345678000100'};
ctx.xmlReport=expected.map(([competencia,direction,total],i)=>({kind:'nota',competencia,total,key:String(i),emitId:direction==='saida'?book.ownCnpj:'other',destId:direction==='entrada'?book.ownCnpj:'other'}));
ctx.xmlReport.push({...ctx.xmlReport[0]}, {...ctx.xmlReport[0],key:'cancelled',cancelEvents:[{}]});
const comparison=ctx.compareXmlToP9(book);
assert.equal(comparison.rows.length,6);
assert.ok(comparison.rows.every(r=>r.match&&Math.abs(r.difference)<0.001&&r.xml.notes===1));
// Check all inline scripts still compile after the focused edit.
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/(?:ld\+)?json/.test(script[1]))new vm.Script(script[2]);
if(process.argv[2]){
  // The bundled browser PDF.js only needs these shims for text extraction in Node.
  globalThis.DOMMatrix??=class DOMMatrix {};
  Uint8Array.prototype.toHex??=function(){return Buffer.from(this).toString('hex')};
  const lib=await import(new URL('vendor/pdf.min.mjs',root));
  lib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.min.mjs',root).href;
  ctx.loadPdfJs=async()=>lib;
  ctx.parseServiceBook=()=>{throw new Error('P9 incorrectly routed to services')};
  const bytes=fs.readFileSync(process.argv[2]);
  const result=await ctx.readFiscalBookPdf({name:'test.pdf',arrayBuffer:async()=>bytes});
  assert.equal(result.pages,6);
  assert.equal(result.ownCnpj.length,14);
  assert.deepEqual(JSON.parse(JSON.stringify(result.totals.map(t=>[t.competencia,t.direction,t.valorContabil]))),expected);
  console.log('PASS: original PDF → bundled PDF.js → production reader → six correct monthly totals');
}
console.log('PASS: six-page fixture, labelled headers, invalid dates, separate periods, cancellations, duplicates, script syntax');
console.table(expected.map(([period,direction,total])=>({period,direction,total})));

