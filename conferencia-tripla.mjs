// Conferência documental NF-e/NFC-e: valores em centavos; ausente nunca equivale a zero.
import {cents,parseDelimited} from './sheet-compare.mjs';
export const taxFields=['valor','bcICMS','icms','bcST','st','ipi','pis','cofins'];
export const labels={valor:'Valor documento',bcICMS:'Base ICMS',icms:'ICMS',bcST:'Base ICMS-ST',st:'ICMS-ST',ipi:'IPI',pis:'PIS',cofins:'COFINS',bcIPI:'Base IPI',bcPIS:'Base PIS',bcCOFINS:'Base COFINS',cfop:'CFOP',cstICMS:'CST/CSOSN ICMS',cstIPI:'CST IPI',cstPIS:'CST PIS',cstCOFINS:'CST COFINS'};
const digits=v=>String(v??'').replace(/\D/g,'');
const keyOf=v=>String(v??'').trim().replace(/^'/,'');
const validKey=k=>/^\d{44}$/.test(k);
const date=v=>/^\d{8}$/.test(v||'')?v.slice(4,8)+'-'+v.slice(2,4)+'-'+v.slice(0,2):String(v||'').slice(0,10);
const status=s=>['02','03'].includes(s)?'cancelada':['04','05'].includes(s)?'excluída':s?'escriturada':'não informado';
const unique=a=>[...new Set(a.filter(Boolean))].sort();
const mapFields=(row,map)=>Object.fromEntries(Object.entries(map).map(([k,i])=>[k,cents(row[i])]));
const group=(x)=>[x.cfop,x.cstICMS].filter(Boolean).join('|');
const addIssue=(list,source,type,doc,field='',left=null,right=null,note='')=>list.push({source,type,key:doc?.key||'',num:doc?.num||'',direction:doc?.direction||'',field,left,right,note});
export function parseSped(text,{cnpj='',period=''}={}){
 let header=null,current=null;const docs=[],issues=[];let c170=0,c190=0;const endings=new Set();
 for(const line of String(text).replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(!line.startsWith('|'))continue;
  const r=line.split('|').slice(1,-1),reg=r[0];
  if(reg==='0000'){
   if(header)throw Error('Mais de um registro 0000 no mesmo arquivo.');
   header={version:r[1],start:date(r[3]),end:date(r[4]),cnpj:digits(r[6]),name:r[5]};
  }
  if(reg==='9999')endings.add(reg);
  if(reg==='C100'){
   current=null;
   if(!['55','65'].includes(r[4]))continue;
   if(!['0','1'].includes(r[1]))throw Error('C100 com indicador de operação inválido.');
   const key=keyOf(r[8]),sit=r[5];
   current={key,num:r[7],series:r[6],model:r[4],direction:r[1]==='0'?'entrada':'saida',own:r[2]==='0',date:date(r[9]),entryDate:date(r[10]),status:status(sit),sit,values:mapFields(r,{valor:11,bcICMS:20,icms:21,bcST:22,st:23,ipi:24,pis:25,cofins:26}),items:[],analytic:[]};
   docs.push(current);continue;
  }
  if(reg==='C170'&&current){
   c170++;
   current.items.push({num:r[1],code:r[2],description:r[3],cfop:r[10],cstICMS:r[9],cstIPI:r[19],cstPIS:r[24],cstCOFINS:r[30],values:mapFields(r,{valor:6,bcICMS:12,icms:14,bcST:15,st:17,bcIPI:21,ipi:23,bcPIS:25,pis:29,bcCOFINS:31,cofins:35})});
  }else if(reg==='C190'&&current){
   c190++;current.analytic.push({cfop:r[2],cstICMS:r[1],rate:r[3],values:mapFields(r,{valor:4,bcICMS:5,icms:6,bcST:7,st:8,ipi:10})});
  }else if(/^C[2-9]/.test(reg)||/^[DEGHK1]/.test(reg))current=null;
 }
 if(!header||!endings.has('9999'))throw Error('TXT incompleto ou não reconhecido como EFD ICMS/IPI (0000/9999).');
 if(cnpj&&header.cnpj!==cnpj)throw Error('CNPJ do SPED difere do estabelecimento informado.');
 if(period&&(header.start.slice(0,7)!==period||header.end.slice(0,7)!==period))throw Error('Competência do SPED diferente da selecionada.');
 for(const d of docs){if(!validKey(d.key))addIssue(issues,'SPED','Chave ausente/inválida',d,'',null,null,'Documento sem chave não é cruzado automaticamente.');}
 return {docs,issues,header,c170,c190};
}
const children=n=>Array.from(n?.children||[]);
const child=(n,name)=>children(n).find(x=>x.localName===name);
const path=(n,...names)=>names.reduce(child,n);
const val=(n,...names)=>path(n,...names)?.textContent?.trim()||'';
const nodes=(n,name)=>Array.from(n.getElementsByTagName('*')).filter(x=>x.localName===name);
function taxItem(det){
 const p=child(det,'prod'),i=child(det,'imposto'),ic=children(child(i,'ICMS'))[0],ipi=children(child(i,'IPI')).find(x=>/^IPITrib$|^IPINT$/.test(x.localName)),pis=children(child(i,'PIS'))[0],cof=children(child(i,'COFINS'))[0];
 return {num:det.getAttribute('nItem')||'',code:val(p,'cProd'),description:val(p,'xProd'),cfop:val(p,'CFOP'),cstICMS:val(ic,'CSOSN')||(val(ic,'CST')?val(ic,'orig')+val(ic,'CST'):''),cstIPI:val(ipi,'CST'),cstPIS:val(pis,'CST'),cstCOFINS:val(cof,'CST'),values:{valor:cents(val(p,'vProd')),bcICMS:cents(val(ic,'vBC')),icms:cents(val(ic,'vICMS')),bcST:cents(val(ic,'vBCST')),st:cents(val(ic,'vICMSST')),bcIPI:cents(val(ipi,'vBC')),ipi:cents(val(ipi,'vIPI')),bcPIS:cents(val(pis,'vBC')),pis:cents(val(pis,'vPIS')),bcCOFINS:cents(val(cof,'vBC')),cofins:cents(val(cof,'vCOFINS'))}};
}
export function parseXml(raw,cnpj,Parser=globalThis.DOMParser){
 if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('XML com DTD/entidade não aceito.');
 const x=new Parser().parseFromString(raw,'application/xml');
 if(nodes(x,'parsererror').length||x.documentElement?.localName==='parsererror')throw Error('XML inválido.');
 const docs=[],events=[],issues=[];
 for(const ret of nodes(x,'retEvento')){
  const e=child(ret,'infEvento');
  if(val(e,'tpEvento')!=='110111')continue;
  const key=val(e,'chNFe'),cstat=val(e,'cStat');
  if(validKey(key)&&['135','155'].includes(cstat))events.push(key);
  else addIssue(issues,'XML','Cancelamento não comprovado',{key},'cStat',cstat,null,'Evento não vinculado ou não homologado; conferir SEFAZ.');
 }
 for(const n of nodes(x,'infNFe')){
  const key=keyOf(n.getAttribute('Id')).replace(/^NFe/,''),ide=child(n,'ide'),emit=val(n,'emit','CNPJ'),dest=val(n,'dest','CNPJ'),model=val(ide,'mod');
  if(!['55','65'].includes(model))continue;
  if(emit!==cnpj&&dest!==cnpj)continue;
  if(!validKey(key)){addIssue(issues,'XML','Chave inválida',{key,num:val(ide,'nNF')});continue}
  const prot=nodes(x,'infProt').find(p=>val(p,'chNFe')===key),cstat=val(prot,'cStat'),tot=path(n,'total','ICMSTot');
  const cancelled=['101','151','155'].includes(cstat),denied=['110','301','302'].includes(cstat);
  const own=emit===cnpj;
  docs.push({key,num:val(ide,'nNF'),series:val(ide,'serie'),model,own,direction:own?(val(ide,'tpNF')==='0'?'entrada':'saida'):'entrada',date:date(val(ide,'dhEmi')||val(ide,'dEmi')),status:cancelled?'cancelada':denied?'excluída':['100','150'].includes(cstat)?'autorizada':'sem protocolo confirmado',values:Object.fromEntries(Object.entries({valor:'vNF',bcICMS:'vBC',icms:'vICMS',bcST:'vBCST',st:'vST',ipi:'vIPI',pis:'vPIS',cofins:'vCOFINS'}).map(([k,t])=>[k,cents(val(tot,t))])),items:children(n).filter(d=>d.localName==='det').map(taxItem),analytic:[]});
 }
 return {docs,events,issues};
}
export function parseBookRows(rows){
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const headerIndex=rows.findIndex(r=>r.map(norm).includes('chv_nfe')&&r.map(norm).includes('vl_doc')&&r.map(norm).includes('ind_oper'));
 if(headerIndex<0)throw Error('Livro em planilha: use o modelo com chv_nfe, ind_oper e vl_doc. PDF P9 é tratado separadamente.');
 const h=rows[headerIndex].map(norm),docs=[],issues=[];
 for(const row of rows.slice(headerIndex+1)){
  if(!row.some(v=>String(v??'').trim()))continue;
  const g=k=>row[h.indexOf(k)]??'',key=keyOf(g('chv_nfe')),op=String(g('ind_oper')).trim(),sit=String(g('cod_sit')).trim().padStart(2,'0');
  if(!['0','1'].includes(op))throw Error('Livro: ind_oper deve ser 0 ou 1.');
  const doc={key,num:String(g('num_doc')),series:String(g('ser')),direction:op==='0'?'entrada':'saida',status:g('cod_sit')!==''?status(sit):'não informado',values:Object.fromEntries(Object.entries({valor:'vl_doc',bcICMS:'vl_bc_icms',icms:'vl_icms',bcST:'vl_bc_icms_st',st:'vl_icms_st',ipi:'vl_ipi',pis:'vl_pis',cofins:'vl_cofins'}).map(([k,v])=>[k,cents(g(v))])),items:[],analytic:[]};
  doc.cfops=unique(String(g('cfop')).split(/[,;/\s]+/));doc.csts=unique(String(g('cst_icms')).split(/[,;/\s]+/));
  if(!validKey(key))addIssue(issues,'Livro','Chave ausente/inválida',doc,'',null,null,'Não será cruzada por número isolado.');
  docs.push(doc);
 }
 if(!docs.length)throw Error('Livro sem registros.');
 return {docs,issues};
}
const excluded=d=>['cancelada','excluída'].includes(d.status);
function indexDocs(source,docs,issues){
 const map=new Map();
 for(const d of docs){
  if(!validKey(d.key))continue;
  if(map.has(d.key)){
   const old=map.get(d.key);
   addIssue(issues,source,'Duplicidade',d,'Valor documento',old.values.valor,d.values.valor,'A chave aparece mais de uma vez; total conta uma vez. Valores conflitantes exigem revisão.');
   old.duplicate=true;
   if(excluded(d))old.status=d.status;
  }else map.set(d.key,{...d});
 }
 return map;
}
const setFor=(d,field)=>field==='cfop'&&d.cfops?.length?d.cfops:field==='cstICMS'&&d.csts?.length?d.csts:unique((d.analytic?.length&&['cfop','cstICMS'].includes(field)?d.analytic:d.items||[]).map(x=>x[field]));
function comparePair(a,b,an,bn,issues,tolerance){
 const source=an+' × '+bn;
 if(a.direction!==b.direction)addIssue(issues,source,'Movimento divergente',a,'IND_OPER',a.direction,b.direction,'Conferir entradas/saídas e emissão própria.');
 if(excluded(a)!==excluded(b))addIssue(issues,source,'Situação divergente',a,'Situação',a.status,b.status,'Conferir eventos e COD_SIT.');
 if(excluded(a)||excluded(b)||a.duplicate||b.duplicate)return;
 const thirdParty=an==='XML'&&a.direction==='entrada'&&!a.own;
 const remark=thirdParty?'Entrada de terceiro: escrituração e créditos podem divergir legitimamente do XML do fornecedor.':'Diferença nominal entre fontes; revisar regras de escrituração e arredondamento.';
 for(const f of taxFields){
  const x=a.values[f],y=b.values[f];
  if(x!=null&&y!=null&&Math.abs(x-y)>tolerance)addIssue(issues,source,'Valor/base divergente',a,labels[f],x,y,remark);
 }
 for(const f of ['cfop','cstICMS','cstIPI','cstPIS','cstCOFINS']){
  const x=setFor(a,f),y=setFor(b,f);
  if(x.length&&y.length&&x.join('/')!==y.join('/'))addIssue(issues,source,'Classificação divergente',a,labels[f],x.join('/'),y.join('/'),remark);
 }
 // C170 pode não existir em emissão própria. Não transformar ausência em zero.
 if(a.items?.length&&b.items?.length){
  const bm=new Map(b.items.map(i=>[i.num,i])),am=new Set(a.items.map(i=>i.num));
  if(bm.size!==b.items.length||am.size!==a.items.length){addIssue(issues,source,'Itens ambíguos',a,'NUM_ITEM',null,null,'Numeração duplicada; comparação de itens não executada.');return}
  for(const i of a.items){
   const j=bm.get(i.num);
   if(!j){addIssue(issues,source,'Item sem par',a,'Item '+i.num,i.description||i.code,null,'Conferir correspondência da numeração de itens.');continue}
   for(const f of ['cfop','cstICMS','cstIPI','cstPIS','cstCOFINS'])if(i[f]&&j[f]&&i[f]!==j[f])addIssue(issues,source,'Item: classificação divergente',a,'Item '+i.num+' / '+labels[f],i[f],j[f],remark+' Pareamento por número do item.');
   for(const f of ['valor','bcICMS','icms','bcST','st','bcIPI','ipi','bcPIS','pis','bcCOFINS','cofins']){
    const x=i.values[f],y=j.values[f];
    if(x!=null&&y!=null&&Math.abs(x-y)>tolerance)addIssue(issues,source,'Item: valor/base divergente',a,'Item '+i.num+' / '+labels[f],x,y,remark+' Pareamento por número do item.');
   }
  }
  for(const j of b.items)if(!am.has(j.num))addIssue(issues,source,'Item sem par',a,'Item '+j.num,null,j.description||j.code,'Conferir correspondência da numeração de itens.');
 }
}
export function reconcileThree({xml,sped,book,period,periodEnd=period,tolerance=1}){
 const inPeriod=m=>m>=period&&m<=periodEnd;
 const periodLabel=period===periodEnd?period:period+' a '+periodEnd;
 const sources=[...(xml?['xml']:[]),...(sped?['sped']:[]),...(book?['book']:[])];
 if(sources.length<2)throw Error('Envie pelo menos duas fontes para comparar.');
 const issues=[...(xml?.issues||[]),...(sped?.issues||[]),...(book?.issues||[])];
 const events=new Set(xml?.events||[]);
 const xm=xml?indexDocs('XML',xml.docs.map(d=>events.has(d.key)?{...d,status:'cancelada'}:d),issues):null,sm=sped?indexDocs('SPED',sped.docs,issues):null,bm=book?.docs?indexDocs('Livro',book.docs,issues):null;
 // XML de entrada pode ser emitido em mês anterior: manter se escriturado neste SPED.
 const maps=[...(xm?[['XML',xm]]:[]),...(sm?[['SPED',sm]]:[]),...(bm?[['Livro',bm]]:[])],keys=new Set(maps.flatMap(([,m])=>[...m.keys()]));
 const notes=[];
 for(const key of keys){
  const x=xm?.get(key),s=sm?.get(key),b=bm?.get(key),d=s||b||x;
  if(x&&!s&&!b&&period&&!inPeriod(x.date.slice(0,7))){addIssue(issues,'XML','Fora da competência de emissão',x,'Data',x.date,periodLabel,'Sem correspondência no período. Conferir data de entrada. Não incluído no total XML do período.');continue}
  for(const [name,m] of maps)if(!m.has(key))addIssue(issues,name,'Documento ausente',d,'',null,null,'Não localizado no arquivo enviado; verificar escopo e obrigação de escrituração.');
  if(x&&s)comparePair(x,s,'XML','SPED',issues,tolerance);
  if(x&&b)comparePair(x,b,'XML','Livro',issues,tolerance);
  if(s&&b)comparePair(s,b,'SPED','Livro',issues,tolerance);
  if(x?.status==='sem protocolo confirmado')addIssue(issues,'XML','Autorização não comprovada',x,'Situação',x.status,null,'Sem consulta SEFAZ; conferir protocolo.');
  for(const [name,n] of [['XML',x],['SPED',s],['Livro',b]])if(n?.status==='cancelada')addIssue(issues,name,'Cancelada',n,'Situação',n.status,null,'Excluída dos totais considerados.');
  if(s&&!excluded(s)&&!s.analytic.length)addIssue(issues,'SPED','C190 não disponível',s,'',null,null,'Sem confronto analítico de CFOP/CST pelo C190.');
  if(s&&!excluded(s)&&!s.items.length)addIssue(issues,'SPED','C170 não disponível',s,'',null,null,'Pode ser dispensado. Sem confronto de itens e bases de IPI/PIS/COFINS.');
  notes.push({key,num:d.num,direction:d.direction,xml:x||null,sped:s||null,book:b||null});
 }
 for(const key of events)if(!xm.has(key))addIssue(issues,'XML','Evento sem documento XML',{key},'Situação','cancelamento confirmado',null,'Importar o XML original para conferir.');
 const totals=['entrada','saida'].map(direction=>{
  const sum=name=>{const a=notes.map(n=>n[name]).filter(d=>d&&d.direction===direction&&!excluded(d));return a.some(d=>d.values.valor==null)?null:a.reduce((acc,d)=>acc+d.values.valor,0)};
  const x=xml?sum('xml'):null,s=sped?sum('sped'):null;
  const monthly=book?.totals?.filter(t=>inPeriod(t.period)&&t.direction===direction)||[];
  const span=(Number(periodEnd?.slice(0,4))-Number(period?.slice(0,4)))*12+Number(periodEnd?.slice(5,7))-Number(period?.slice(5,7))+1;
  const bt=bm?sum('book'):monthly.length===span&&new Set(monthly.map(t=>t.period)).size===span?monthly.reduce((a,t)=>a+t.amount,0):null;
  return {direction,xml:x,sped:s,book:bt,xmlSped:x!=null&&s!=null?s-x:null,spedBook:s!=null&&bt!=null?bt-s:null,xmlBook:x!=null&&bt!=null?bt-x:null};
 });
 return {notes,issues,totals,bookMode:!book?'não enviado':bm?'documentos':'totais P9',sources,period:periodLabel};
}
