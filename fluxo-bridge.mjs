export const storageKey='fiscora-fluxo-v1';
export function packets(){try{const a=JSON.parse(sessionStorage.getItem(storageKey)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
export function savePacket(packet){
 if(!/^\d{14}$/.test(packet.cnpj)||!Array.isArray(packet.rows))throw Error('Identificação ou dados inválidos.');
 const a=packets().filter(p=>!(p.kind===packet.kind&&p.cnpj===packet.cnpj));a.push({...packet,at:new Date().toISOString()});sessionStorage.setItem(storageKey,JSON.stringify(a));
}
export function sendPacket(packet){savePacket(packet);location.href='./fluxo-fiscal.html'}
export const amount=v=>v==null||v===''||!Number.isFinite(Number(String(v).replace(',','.')))?null:Math.round(Number(String(v).replace(',','.'))*100);
export function contributionRows(files){return files.flatMap(f=>['M200','M600'].map((reg,i)=>{const a=f.rows.filter(r=>r[0]===reg);const r=a.length===1?a[0]:[];return {period:f.period,tax:i?'COFINS':'PIS',source:reg,debit:amount(r[1]),credit:amount(r[2]),priorCredit:amount(r[3]),declared:amount(r[12]),cumulative:amount(r[11])}}))}
export function icmsRows(ap){return ap.map(r=>({period:r.period,tax:'ICMS',source:'E110',debit:r.values[0]??null,credit:r.values[4]??null,priorCredit:r.values[8]??null,declared:r.values[11]??null,carry:r.values[12]??null}))}
export function monthlyRows(rows){return [...new Set(rows.map(r=>r.period))].map(period=>{const a=rows.filter(r=>r.period===period),get=(d,f)=>a.find(r=>r.direction===d&&r.field===f);return {period,tax:'ICMS',source:'C100 — movimento documental',debit:get('saida','icms')?.sped??null,credit:get('entrada','icms')?.sped??null,declared:null,monthly:a.map(r=>({label:r.direction+' / '+r.label,status:r.status,xml:r.xml??null,sped:r.sped??null,book:r.book??null})),div:a.filter(r=>r.status==='DIVERGENTE').length}})}
export function combine(packets,cnpj,period){const list=packets.filter(p=>p.cnpj===cnpj).flatMap(p=>p.rows.filter(r=>r.period===period).map(r=>({...r,kind:p.kind,at:p.at})));return ['ICMS','PIS','COFINS'].map(tax=>{const a=list.filter(r=>r.tax===tax),ordered=[...a].sort((x,y)=>rank(y)-rank(x)||String(y.at).localeCompare(String(x.at)));return {...(ordered[0]||{}),tax,period,evidence:a,div:a.reduce((n,r)=>n+(r.div||0),0)}})}
function rank(r){return r.source==='E110'||r.source==='M200'||r.source==='M600'?3:1}
export function preview(row,regime,approved,checked){if(!checked||!['real','presumido'].includes(regime)||!Number.isSafeInteger(row.debit)||!Number.isSafeInteger(approved)||approved<0||!Number.isSafeInteger(row.credit)||row.credit<0||approved>row.credit||(regime==='presumido'&&row.tax!=='ICMS'))return null;return {balance:row.debit-approved,pay:Math.max(0,row.debit-approved),carry:Math.max(0,approved-row.debit)}}
