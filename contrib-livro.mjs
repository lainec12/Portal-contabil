import {parseEfd} from './auditoria-fiscal.mjs';
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const val=s=>s==null||s===''||/^-+$/.test(s)?null:/^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(s)?Math.round(Number(s.replace(/\./g,'').replace(',','.'))*100):null;
const scaled=(s,scale)=>s==null||s===''||!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(s)?null:Math.round(Number(s.replace(/\./g,'').replace(',','.'))*scale);
const sum=a=>a.length&&!a.some(v=>v==null)?a.reduce((x,y)=>x+y,0):null;
const summary=[
'Valor Total da Contribuição Não Cumulativa do Período','Valor do Crédito Descontado, Apurado no Próprio Período da Escrituração','Valor do Crédito Descontado, Apurado em Período de Apuração Anterior','Valor Total da Contribuição Não Cumulativa Devida','Valor Retido na Fonte Deduzido no Período','Outras Deduções do Regime Não Cumulativo no Período','Valor da Contribuição Não Cumulativa a Recolher/Pagar','Valor Total da Contribuição Cumulativa do Período','Valor Retido na Fonte Deduzido no Período','Outras Deduções no Período','Valor da Contribuição Cumulativa a Recolher/Pagar','Valor Total da Contribuição a Recolher/Pagar no Período'];
const credits=[[3,'Valor da Base de Cálculo do Crédito'],[4,'Alíquota Em percentual'],[5,'Quantidade – Base de cálculo'],[6,'Alíquota Em reais'],[7,'Valor total do crédito apurado no período'],[8,'Valor total dos ajustes de acréscimo'],[9,'Valor total dos ajustes de redução'],[10,'Valor total do crédito diferido no período'],[11,'Valor Total do Crédito Disponível relativo ao Período'],[13,'Valor do Crédito disponível, descontado da contribuição apurada no próprio'],[14,'Saldo de créditos a utilizar em períodos futuros']];
export function parseBook(pages){
 let period='',section='summary',creditCodes=[null,null],summaryIndex=0,cnpj='',title=false;const rows=[],seen=new Set();
 for(const page of pages)for(const raw of page){
  const line=String(raw).trim().replace(/\s+/g,' '),n=norm(line);if(!line)continue;
  if(n.includes('apuracao do pis/pasep e cofins'))title=true;
  const c=line.match(/CNPJ\s*:\s*([\d./-]+)/i);if(c){const v=c[1].replace(/\D/g,'');if(cnpj&&cnpj!==v)throw Error('CNPJs diferentes no Livro.');cnpj=v}
  const p=line.match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{4})$/);if(p){period=p[2]+'-'+p[1];section='summary';summaryIndex=0;creditCodes=[null,null];continue}
  if(!period)continue;
  if(n==='credito'){section='credit';creditCodes=[null,null];continue}
  if(n.startsWith('detalhamento da base de calculo do credito')){section='nature';continue}
  if(n==='debito'){section='debit';continue}
  const parts=line.match(/^(.*?)\s+(-?\d[\d.]*,?\d*|-{2,})\s+(-?\d[\d.]*,?\d*|-{2,})$/);if(!parts)continue;
  const label=parts[1].trim(),l=norm(label),values=[val(parts[2]),val(parts[3])];
  if(section==='credit'&&l.startsWith('codigo de tipo de credito')){creditCodes=[parts[2],parts[3]];continue}
  let field='',code='',scope=section;
  if(section==='summary'){
   if(l.startsWith('saldo de creditos a utilizar em periodo de apuracao futuro'))field='carry';else{const i=summary.findIndex((s,j)=>j>=summaryIndex&&norm(s)===l);if(i<0)continue;summaryIndex=i+1;field=String(i+1)}
  }else if(section==='credit'){
   const f=credits.find(([,s])=>l===norm(s)||l.startsWith(norm(s)+' '));if(!f)continue;field=String(f[0]);
  }else{const m=label.match(/^(\d{2})\s+(.+)$/);if(!m)continue;code=m[1];field='value'}
  for(let i=0;i<2;i++){
   const tax=i?'COFINS':'PIS',k=section==='credit'?creditCodes[i]||'':code;
   const id=[period,tax,scope,k,field].join('|');
   if(seen.has(id))throw Error('Linha repetida ou múltiplos grupos de crédito com o mesmo código no Livro: '+period+' '+label+'. Separe por relatório ou confira o modelo.');
   const unit=scope==='credit'&&field==='4'?'percent':scope==='credit'&&field==='5'?'quantity':scope==='credit'&&field==='6'?'rate':'money';
   seen.add(id);rows.push({period,tax,scope,code:k,field,label,unit,book:unit==='money'?values[i]:scaled(parts[i+2],10000)});
  }
 }
 if(!title||!/^\d{14}$/.test(cnpj)||!rows.some(r=>r.scope==='summary'))throw Error('Modelo de Livro de Contribuições não reconhecido. Use PDF pesquisável com título Apuração do Pis/Pasep e Cofins.');
 const periods=[...new Set(rows.map(r=>r.period))];for(const p of periods)for(const tax of ['PIS','COFINS']){const found=new Set(rows.filter(r=>r.period===p&&r.tax===tax&&r.scope==='summary').map(r=>r.field));if(!Array.from({length:12},(_,i)=>String(i+1)).every(k=>found.has(k)))throw Error('Resumo de '+tax+' incompleto na competência '+p+'. Confira a leitura do PDF.');}
 return {cnpj,rows};
}
export function compareContribution(books,files,tolerance=1){
 const map=new Map(),bookKeys=new Set(),output=[];
 for(const b of books)for(const row of b.rows){const k=[row.period,row.tax,row.scope,row.code,row.field].join('|');if(bookKeys.has(k))throw Error('Livro repetido: '+row.period+' '+row.label);bookKeys.add(k)}
 const companies=new Set([...books.map(b=>b.cnpj),...files.map(f=>f.cnpj)]);if(companies.size!==1)throw Error('CNPJ do Livro e da EFD não coincide.');
 for(const f of files){if(map.has(f.period))throw Error('Mais de uma EFD para '+f.period);map.set(f.period,f.rows)}
 for(const b of books)for(const r of b.rows){
  const rows=map.get(r.period),pis=r.tax==='PIS',regs=pis?['M200','M100','M105','M210']:['M600','M500','M505','M610'];let sped=null,record='',noRecord=false;
  if(rows){
   if(r.scope==='summary'){if(r.field==='carry'){record=pis?'1100':'1500';const a=rows.filter(x=>x[0]===record);sped=sum(a.map(x=>val(x[17])));noRecord=!a.length}else{record=regs[0];const a=rows.filter(x=>x[0]===record);if(a.length===1)sped=val(a[0][Number(r.field)])}}
   if(r.scope==='credit'){record=regs[1];const a=rows.filter(x=>x[0]===record&&x[1]===r.code);if(r.unit&&r.unit!=='money'){const vs=a.map(x=>scaled(x[Number(r.field)],10000));if(r.unit==='quantity')sped=sum(vs);else if(vs.length&&vs.every(v=>v!=null&&v===vs[0]))sped=vs[0];if(vs.length&&vs.every(v=>v==null))noRecord=true}else sped=sum(a.map(x=>val(x[Number(r.field)])));}
   if(r.scope==='nature'){record=regs[2];sped=sum(rows.filter(x=>x[0]===record&&x[1]===r.code).map(x=>val(x[6])))}
   if(r.scope==='debit'){record=regs[3];const a=rows.filter(x=>x[0]===record&&x[1]===r.code);if(r.period>='2019-01')sped=sum(a.map(x=>val(x[15])));noRecord=!a.length}
  }
  const delta=sped==null||r.book==null?null:r.book-sped;
  output.push({...r,sped,delta,record,status:delta==null?(noRecord&&r.book===0?'Sem registro / Livro zero':!rows?'Sem EFD':'Não comparável'):Math.abs(delta)>(r.unit&&r.unit!=='money'?0:tolerance)?'DIVERGENTE':'CONFERE'});
 }
 const periods=new Set(books.flatMap(b=>b.rows.map(r=>r.period)));return {cnpj:[...companies][0],rows:output,missingBook:files.filter(f=>!periods.has(f.period)).map(f=>f.period),missingSped:[...periods].filter(p=>!map.has(p))};
}
export {parseEfd};
