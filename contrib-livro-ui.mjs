import {parseBook,compareContribution,parseEfd} from './contrib-livro.mjs';
import * as pdfjs from './vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
const $=id=>document.getElementById(id),e=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
const money=v=>v==null?'Não disponível':(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const names={summary:'Resumo da apuração',credit:'Créditos por tipo',nature:'Bases por natureza do crédito',debit:'Débitos por código'};
let data=null;
async function pdf(file){
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise,pages=[];
 try{for(let i=1;i<=doc.numPages;i++){
  const p=await doc.getPage(i),content=await p.getTextContent(),lines=[];
  for(const item of content.items){if(!item.str?.trim())continue;const x=item.transform[4],y=item.transform[5];let row=lines.find(r=>Math.abs(r.y-y)<1.6);if(!row){row={y,items:[]};lines.push(row)}row.items.push({x,str:item.str})}
  pages.push(lines.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.x-b.x).map(a=>a.str).join(' ')));
 }}finally{await doc.destroy()}
 return parseBook(pages);
}
async function txt(file){const b=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(b)}catch{return new TextDecoder('windows-1252').decode(b)}}
const headers=['Competência','Tributo','Código','Descrição','Registro SPED','SPED','Livro','Livro − SPED','Resultado'];
const cells=r=>[r.period,r.tax,r.code,r.label,r.record,money(r.sped),money(r.book),money(r.delta),r.status];
function table(d,rows){const t=d.createElement('table'),h=t.createTHead().insertRow();for(const v of headers){const x=d.createElement('th');x.textContent=v;h.append(x)}const body=t.createTBody();for(const r of rows){const tr=body.insertRow();if(r.status==='DIVERGENTE')tr.className='bad';for(const v of cells(r))tr.insertCell().textContent=v}return t}
function draw(){const root=$('contribBookResults');root.replaceChildren();if(!data)return;
 const rows=data.rows.filter(r=>(!$('contribMonth').value||r.period===$('contribMonth').value)&&(!$('contribDiff').checked||r.status==='DIVERGENTE'));
 for(const p of [...new Set(rows.map(r=>r.period))].sort()){const det=e('details');det.append(e('summary',p+' · '+rows.filter(r=>r.period===p&&r.status==='DIVERGENTE').length+' divergências'));for(const scope of Object.keys(names)){const rr=rows.filter(r=>r.period===p&&r.scope===scope);if(!rr.length)continue;const sub=e('details');sub.append(e('summary',names[scope]+' · '+rr.length+' campos'));const wrap=e('div');wrap.className='scroll';wrap.append(table(document,rr));sub.append(wrap);det.append(sub)}root.append(det)}
}
$('contribBookRun').onclick=async()=>{const status=$('contribBookStatus');$('contribBookRun').disabled=true;data=null;$('contribBookResults').replaceChildren();try{
 const bs=[...$('contribBook').files],fs=[...$('contribBookSped').files];if(!bs.length||!fs.length)throw Error('Envie Livro PDF e EFD-Contribuições TXT.');
 status.textContent='Lendo PDF e EFD…';const books=[],files=[];for(const f of bs)books.push(await pdf(f));for(const f of fs)files.push(parseEfd(await txt(f),'contrib'));
 data=compareContribution(books,files);$('contribMonth').replaceChildren(new Option('Todas',''),...[...new Set(data.rows.map(r=>r.period))].sort().map(p=>new Option(p,p)));$('contribDiff').checked=false;draw();
 status.textContent=data.rows.length+' campos · '+data.rows.filter(r=>r.status==='DIVERGENTE').length+' divergências · '+data.rows.filter(r=>r.status==='Não comparável').length+' não comparáveis.'+(data.missingBook.length?' Sem Livro: '+data.missingBook.join(', '):'')+(data.missingSped.length?' Sem EFD: '+data.missingSped.join(', '):'');
 }catch(err){status.textContent=err.message}finally{$('contribBookRun').disabled=false}};
$('contribMonth').onchange=$('contribDiff').onchange=draw;
$('contribBookPdf').onclick=()=>{if(!data)return;const w=window.open('','_blank');if(!w)return;const d=w.document;d.title='Fiscora — Livro de Contribuições';const s=d.createElement('style');s.textContent='@page{size:A4 landscape;margin:10mm}body{font:11px Arial;color:#302340}table{border-collapse:collapse;width:100%;font-size:9px}td,th{border:1px solid #ddd;padding:5px}th{background:#eee4f5}thead{display:table-header-group}tr{break-inside:avoid}.bad{background:#fff0ef;color:#9c2525}h2,h3{break-after:avoid}';d.head.append(s);const add=(tag,v)=>{const n=d.createElement(tag);n.textContent=v;d.body.append(n)};add('h1','Fiscora — Livro × EFD-Contribuições');add('p',$('contribBookStatus').textContent);add('p','Comparação dos valores declarados; campos ausentes não equivalem a zero. Não comprova direito ao crédito.');for(const p of [...new Set(data.rows.map(r=>r.period))].sort()){add('h2',p);for(const scope of Object.keys(names)){const rows=data.rows.filter(r=>r.period===p&&r.scope===scope);if(rows.length){add('h3',names[scope]);d.body.append(table(d,rows))}}}w.focus();w.print()};
$('contribBookExcel').onclick=()=>{if(!data)return;const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([headers,...data.rows.map(r=>[r.period,r.tax,r.code,r.label,r.record,...[r.sped,r.book,r.delta].map(v=>v==null?'':v/100),r.status])]);ws['!cols']=[{wch:13},{wch:12},{wch:10},{wch:75},{wch:14},{wch:18},{wch:18},{wch:18},{wch:20}];XLSX.utils.book_append_sheet(wb,ws,'Contribuições');XLSX.writeFile(wb,'fiscora-livro-contribuicoes.xlsx')};
