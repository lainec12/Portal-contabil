import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../portal.js',import.meta.url),'utf8');
const ctx=vm.createContext({console,Date,Number,Map,Set,Math,xmlBookComparison:null,xmlReport:[],money:v=>'R$ '+Number(v).toFixed(2),esc:v=>String(v??''),crossMovementHintHtml:()=>'',ownEntryNoticeHtml:()=>'',outputWithEntryCfopHtml:()=>'',xmlBookResult:()=>''});
vm.runInContext(src.slice(src.indexOf('  function fiscalCancelled'),src.indexOf('  function xmlBookResult')),ctx);
vm.runInContext(src.slice(src.indexOf('  function findDifferenceNoteCandidates'),src.indexOf('  function cancelledBookMatch')),ctx);
const note=(key,month,rows,total,cancel=false)=>({kind:'nota',key,name:key,competencia:month,cfopRows:rows.map(([cfop,produtos])=>({cfop,produtos})),total,cfops:rows.map(r=>r[0]).join(', '),cancelEvents:cancel?[{}]:[],status:cancel?'CANCELADA':'Autorizada'});
const a=note('a','2026-08',[['5929',100],['5102',900]],1000),b=note('b','2026-08',[['6929',200]],200),ret=note('r','2026-08',[['1202',50]],50),cancel=note('c','2026-08',[['5929',80]],80,true),sep=note('s','2026-09',[['5929',25]],25);
ctx.xmlReport=[a,{...a},b,ret,cancel,sep];
const docs=ctx.xmlReport.filter(n=>n.competencia==='2026-08').map(note=>({note,included:!note.cancelEvents.length}));
const parts=ctx.fiscalSpecialParts(docs);
assert.deepEqual(JSON.parse(JSON.stringify(parts)),{cfop5929:10000,cfop6929:20000,devolucoes:5000,canceladas:8000});
assert.match(ctx.cfop929DifferenceLabel(docs,430),/CFOPs.*300.00.*devoluções.*50.00.*canceladas.*80.00.*430.00/);
assert.match(ctx.cfop929DifferenceLabel(docs,-430),/430.00/);
assert.equal(ctx.cfop929DifferenceLabel(docs,431),'');
assert.equal(ctx.cfop929DifferenceLabel(docs,.01),'');
assert.equal(ctx.fiscalSpecialMonthly(ctx.xmlReport).length,2);
// Cancellation on a duplicate wins, independent of input order, with no overlap.
for(const records of [[a,{...a,cancelEvents:[{}]}],[{...a,cancelEvents:[{}]},a]]){
 const p=ctx.fiscalSpecialParts(records.map(note=>({note,included:true})));
 assert.equal(p.cfop5929,0);assert.equal(p.canceladas,100000);
}
const csv=ctx.fiscalSpecialCsvRows(ctx.xmlReport);
assert.equal(csv.find(r=>r.month==='2026-08'&&r.label==='CFOP 5.929').value,100);
assert.equal(csv.find(r=>r.month==='2026-08'&&r.label==='Soma para conferência').value,430);
assert.match(ctx.fiscalSpecialReportHtml(ctx.xmlReport),/Total geral/);
const start=src.indexOf('  function buildXmlBookSaveReport('),end=src.indexOf("  document.getElementById('printXmlReport')",start);
vm.runInContext(src.slice(start,end),ctx);
const report=ctx.buildXmlBookSaveReport();
if(process.env.FISCAL_QA_REPORT)fs.writeFileSync(process.env.FISCAL_QA_REPORT,report);
assert.match(report,/Demonstrativo mensal/);assert.match(report,/2026-08/);assert.match(report,/R\$ 100.00/);assert.match(report,/R\$ 430.00/);
// Execute the actual CSV export callback with minimal browser download stubs.
let callback,blob;
ctx.document={getElementById:()=>({addEventListener:(_,cb)=>callback=cb}),createElement:()=>({click(){}})};
ctx.Blob=class{constructor(chunks){blob=chunks.join('')}};
ctx.URL={createObjectURL:()=>'',revokeObjectURL(){}};ctx.setTimeout=()=>{};ctx.xmlServiceComparison=null;ctx.xmlResults={};
ctx.xmlReportStats=()=>({totalGross:0,totalUnique:0,totalCancelled:0,totalNotCancelled:0});
vm.runInContext(src.slice(src.indexOf("  document.getElementById('exportXmlCsv')"),src.indexOf('  // Histórico local de 12 competências')),ctx);
callback();assert.match(blob,/DEMONSTRATIVO MENSAL/);assert.match(blob,/CFOP 5.929/);assert.match(blob,/Soma para conferência/);
console.log('PASS: PDF + actual CSV export include monthly 5929/6929 values, totals, returns, cancellations; mixed CFOPs and duplicate cancellations never double count; combined description matches cents.');
