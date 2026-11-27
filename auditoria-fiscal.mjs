import {cents,parseDelimited} from './sheet-compare.mjs';
export const diff=(a,b)=>a==null||b==null?null:b-a;
export const sum=a=>a.some(v=>v==null)?null:a.reduce((s,v)=>s+v,0);
const money=v=>cents(v);
const date=v=>/^\d{8}$/.test(v||'')?v.slice(4,8)+'-'+v.slice(2,4)+'-'+v.slice(0,2):'';
const key=(...a)=>a.join('|');
export function parseEfd(text,kind='fiscal'){
 const rows=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.startsWith('|')).map(l=>l.split('|').slice(1,-1));
 const h=rows.filter(r=>r[0]==='0000');if(h.length!==1||!rows.some(r=>r[0]==='9999'))throw Error('Arquivo EFD incompleto (0000/9999).');
 const r=h[0],start=date(r[kind==='fiscal'?3:5]),end=date(r[kind==='fiscal'?4:6]),cnpj=r[kind==='fiscal'?6:8],period=start.slice(0,7);
 if(!start||!end||!/^\d{14}$/.test(cnpj||''))throw Error('Cabeçalho incompatível com o tipo de EFD selecionado.');
 if(kind==='fiscal'&&rows.some(r=>['M200','M600'].includes(r[0])))throw Error('Use EFD ICMS/IPI.');
 if(kind==='contrib'&&rows.some(r=>r[0]==='E110'))throw Error('Use EFD-Contribuições.');
 return {rows,period,cnpj,start,end,kind};
}
export const e110Fields=['Débitos de saídas','Ajustes a débito de documentos','Ajustes a débito','Estorno de créditos','Créditos de entradas','Ajustes a crédito de documentos','Ajustes a crédito','Estorno de débitos','Saldo credor anterior','Saldo devedor apurado','Deduções','ICMS a recolher','Saldo credor a transportar','Débitos especiais'];
export const mFields=['Contribuição não cumulativa','Crédito do período descontado','Crédito anterior descontado','Contribuição não cumulativa devida','Retenções não cumulativas','Outras deduções não cumulativas','Não cumulativa a recolher','Contribuição cumulativa','Retenções cumulativas','Outras deduções cumulativas','Cumulativa a recolher','Total a recolher'];
export function fiscal(files){
 const cfop=new Map(),ap=[],adjust=[],stock=[],products=[],suppliers=[],docs=[];
 for(const f of files){
  let doc=null,inventory=null,apPeriod=f.period;const catalog=new Map();
  for(const r of f.rows)if(r[0]==='0200')catalog.set(r[1],r);
  for(const r of f.rows){
   switch(r[0]){
    case 'C100':doc={direction:r[1]==='0'?'entrada':r[1]==='1'?'saida':'?',status:r[5],model:r[4],num:r[7],key:r[8],date:date(r[9]),entryDate:date(r[10]),own:r[2]==='0',value:money(r[11]),period:f.period};docs.push(doc);break;
    case 'C190':if(doc&&!['02','03','04','05'].includes(doc.status)&&['55','65'].includes(doc.model)){
     const k=key(f.period,doc.direction,r[2]),old=cfop.get(k)||{period:f.period,direction:doc.direction,cfop:r[2],values:[0,0,0,0,0]};
     [4,5,6,7,8].forEach((idx,i)=>{let v=money(r[idx]);old.values[i]=old.values[i]==null||v==null?null:old.values[i]+v});cfop.set(k,old);
    }break;
    case 'E100':apPeriod=date(r[1]).slice(0,7)||f.period;doc=null;break;
    case 'E110':ap.push({period:apPeriod,values:e110Fields.map((_,i)=>money(r[i+1]))});break;
    case 'E111':adjust.push([apPeriod,r[1],r[2],money(r[3])]);break;
    case 'H005':inventory=date(r[1]);break;
    case 'H010':{const qty=Number(String(r[3]||'').replace(',','.')),unit=Number(String(r[4]||'').replace(',','.')),v=money(r[5]),calc=r[3]&&r[4]&&Number.isFinite(qty*unit)?Math.round(qty*unit*100):null;stock.push([f.period,inventory,r[1],catalog.get(r[1])?.[2]||'',r[2],r[3],r[4],v,calc,diff(calc,v),r[6],catalog.has(r[1])?'':'Sem cadastro 0200']);break}
    case '0200':products.push([f.period,r[1],r[2],r[7],r[12]||'',r[5],r[6]]);break;
    case '0150':suppliers.push([f.period,r[1],r[2],r[4],r[5],r[6],r[7]]);break;
    default:if(/^C[2-9]|^[DEGHK1]/.test(r[0]))doc=null;
   }
  }
 }
 return {cfop,ap,adjust,stock,products,suppliers,docs};
}
export function compareCfop(fiscalMap,records){
 const book=new Map();for(const r of records){const k=key(r.competencia,r.direction,r.cfop),v=book.get(k)||{period:r.competencia,direction:r.direction,cfop:r.cfop,values:[0,0,0]};['valorContabil','baseIcms','icms'].forEach((f,i)=>{const n=r[f];v.values[i]=v.values[i]==null||n==null||n===''||!Number.isFinite(Number(n))?null:v.values[i]+Math.round(Number(n)*100)});book.set(k,v)}
 const rows=[];for(const k of new Set([...fiscalMap.keys(),...book.keys()])){const s=fiscalMap.get(k),b=book.get(k),v=s||b;for(let i=0;i<3;i++){const a=s?.values[i]??null,z=b?.values[i]??null;rows.push([v.period,v.direction,v.cfop,['Valor operação','Base ICMS','ICMS'][i],a,z,diff(a,z),!s||!b?'CFOP não localizado na outra fonte':diff(a,z)==null?'Não comparável':Math.abs(diff(a,z))>1?'Revisar':'Confere'])}}
 return rows.sort((a,b)=>key(a[0],a[1],a[2]).localeCompare(key(b[0],b[1],b[2])));
}
export function compareFiles(a,b){
 if(a.kind!==b.kind||a.cnpj!==b.cnpj||a.period!==b.period||a.end!==b.end)throw Error('Original e retificador devem ter o mesmo estabelecimento, período e tipo.');
 const counts=rows=>{const m=new Map();for(const r of rows){const k=r.join('|');m.set(k,(m.get(k)||0)+1)}return m},x=counts(a.rows),y=counts(b.rows);
 return [...new Set([...x.keys(),...y.keys()])].filter(k=>x.get(k)!==y.get(k)).map(k=>[k.split('|')[0],x.get(k)||0,y.get(k)||0,k]);
}
export function investigate(docs,rows){
 const map=new Map();for(const d of docs){const k=key(d.period,d.direction);if(!map.has(k))map.set(k,[]);map.get(k).push(d)}
 const output=[];for(const r of rows.filter(r=>r[3]==='Valor operação'&&r[6]!=null&&Math.abs(r[6])>1)){
  const [p,d,cfop,,a,b,delta]=r;const candidates=(map.get(key(p,d))||[]).filter(n=>n.value!=null&&Math.abs(n.value-Math.abs(delta))<=1);
  for(const n of candidates.slice(0,30))output.push([p,d,cfop,delta,n.num,n.key,n.value,n.own?'Emissão própria':n.status,'Coincidência de valor, não comprova relação com CFOP ou causa']);
  if(!candidates.length)output.push([p,d,cfop,delta,'','','', '', 'Sem coincidência individual; conferir outros modelos, competência e escrituração']);
 }return output;
}
export function compareManual(rows){
 const h=rows[0]?.map(x=>String(x).trim().toLowerCase())||[];if(!['competencia','descricao','valor_a','valor_b'].every(k=>h.includes(k)))throw Error('Use cabeçalhos competencia, descricao, valor_a, valor_b.');
 return rows.slice(1).filter(r=>r.some(x=>String(x??'').trim())).map(r=>{const g=k=>r[h.indexOf(k)],a=money(g('valor_a')),b=money(g('valor_b'));return [g('competencia'),g('descricao'),a,b,diff(a,b),a==null||b==null?'Não comparável':Math.abs(b-a)>1?'Revisar':'Confere']});
}
