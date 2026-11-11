// Local extraction only. Fiscal eligibility and F100 classification remain for review.
const digits=v=>String(v??'').replace(/\D/g,'');
const tag=n=>String(n?.localName||n?.nodeName||'').split(':').pop().toLowerCase();
const children=n=>Array.from(n?.children||n?.childNodes||[]).filter(n=>n.nodeType===1);
const child=(n,...names)=>children(n).find(e=>names.map(s=>s.toLowerCase()).includes(tag(e)));
const descendants=(n,...names)=>Array.from(n?.getElementsByTagName?.('*')||[]).filter(e=>names.map(s=>s.toLowerCase()).includes(tag(e)));
const first=(n,...names)=>descendants(n,...names)[0];
const value=(n,...names)=>child(n,...names)?.textContent?.trim()||'';
const deep=(n,...names)=>first(n,...names)?.textContent?.trim()||'';
const xmlNumber=v=>{if(v==='')return null;const n=Number(String(v).includes(',')?String(v).replace(/\./g,'').replace(',','.'):v);return Number.isFinite(n)&&n>=0?n:null};
function date(v){const s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00Z');return Number.isNaN(+d)||d.toISOString().slice(0,10)!==s?'':s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}
function party(node,fallback){
  const get=(...names)=>deep(node,...names)||deep(fallback,...names);
  const address=child(node,'enderNac','endereco','end','enderEmit','enderDest')||child(fallback,'enderNac','endereco','end','enderEmit','enderDest');
  const a=(...names)=>deep(address,...names);
  return {id:digits(get('CNPJ','CPF')),name:value(node,'xNome','RazaoSocial','Nome')||value(fallback,'xNome','RazaoSocial','Nome'),address:{ie:get('IE','InscricaoEstadual'),country:a('cPais','CodigoPais')||'1058',street:a('xLgr','Endereco','Logradouro'),number:a('nro','Numero'),complement:a('xCpl','Complemento'),district:a('xBairro','Bairro'),municipality:a('cMun','CodigoMunicipio')}};
}
export function parseSaamXml(text,Parser=globalThis.DOMParser){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('XML com definição de entidade não é aceito.');
  const doc=new Parser().parseFromString(text,'application/xml');
  if(first(doc,'parsererror')||tag(doc.documentElement)==='parsererror')throw new Error('XML inválido.');
  const notes=[],cancellations=[];
  for(const event of descendants(doc,'infEvento')){
    if(value(event,'tpEvento')==='110111'&&['135','136','155'].includes(value(event,'cStat')))cancellations.push(digits(value(event,'chNFe')));
  }
  for(const n of descendants(doc,'infNFe')){
    const ide=child(n,'ide'),total=child(child(n,'total'),'ICMSTot'),prot=first(doc,'infProt'),number=value(ide,'nNF');
    const emit=party(child(n,'emit')),toma=party(child(n,'dest'));
    notes.push({kind:'NF-e',key:digits(n.getAttribute('Id')||'').slice(-44),number,date:date(value(ide,'dhEmi','dEmi')),emit,toma,amount:xmlNumber(value(total,'vNF')),description:value(ide,'natOp'),cancelled:['101','151','155'].includes(value(prot,'cStat')),source:'XML NF-e'});
  }
  for(const n of descendants(doc,'infNfse')){
    const dps=first(n,'infDPS'),declaration=first(n,'InfDeclaracaoPrestacaoServico')||n;
    const prest=child(dps,'prest')||child(declaration,'Prestador')||child(n,'PrestadorServico'),emit=child(n,'emit','PrestadorServico');
    const toma=child(dps,'toma')||child(n,'TomadorServico')||child(declaration,'TomadorServico','Tomador');
    const service=child(declaration,'Servico'),serviceValues=child(service,'Valores');
    const gross=value(child(child(dps,'valores'),'vServPrest'),'vServ')||value(serviceValues,'ValorServicos')||deep(n,'ValorServicos');
    const issue=value(dps,'dCompet')||value(n,'Competencia')||value(declaration,'Competencia')||value(n,'DataEmissao')||value(dps,'dhEmi')||value(n,'dhProc');
    const container=n.parentNode?.parentNode;
    const cancelled=['101','151','155'].includes(value(n,'cStat'))||!!first(container,'InfConfirmacaoCancelamento','ConfirmacaoCancelamento');
    notes.push({kind:'NFS-e',key:n.getAttribute('Id')||'',number:value(n,'nNFSe','Numero'),date:date(issue),emit:party(emit||prest,prest),toma:party(toma),amount:xmlNumber(gross),description:deep(dps,'xDescServ')||value(service,'Discriminacao'),cancelled,source:'XML NFS-e'});
  }
  return {notes,cancellations};
}
export function prepareSaamXml(notes,{company='',direction='tomados',cancellations=[]}={}){
  const ownSide=direction==='prestados'?'emit':'toma',otherSide=direction==='prestados'?'toma':'emit';
  const ids=new Set(notes.map(n=>n[ownSide]?.id).filter(id=>/^\d{14}$/.test(id)));
  const ownId=digits(company)||(ids.size===1?[...ids][0]:'');
  if(!/^\d{14}$/.test(ownId))throw new Error('Informe o CNPJ da empresa declarante. Há mais de uma empresa ou o CNPJ não está identificado nos XMLs.');
  const cancelledKeys=new Set(cancellations),byId=new Map();let outside=0,duplicates=0,cancelled=0;
  for(const n of notes){
    if(n[ownSide]?.id!==ownId){outside++;continue}
    const id=n.key||[n.kind,n.emit?.id,n.toma?.id,n.number,n.date].join('|');
    const old=byId.get(id),isCancelled=n.cancelled||cancelledKeys.has(n.key);
    if(old){duplicates++;if(old.amount!==n.amount||old.date!==n.date)throw new Error('XMLs duplicados com valores ou datas conflitantes. Confira o lote.');old.cancelled ||= isCancelled;continue}
    byId.set(id,{...n,cancelled:isCancelled});
  }
  const result=[];
  for(const n of byId.values()){
    if(n.cancelled){cancelled++;continue}
    const participant=n[otherSide];
    if(!n.date||n.amount===null||!Number.isFinite(n.amount)||!n.number||!/^\d{11}(?:\d{3})?$/.test(participant?.id||''))throw new Error('Há nota sem data, número, valor ou CPF/CNPJ do participante. Confira os XMLs antes de importar.');
    result.push({date:n.date,number:n.number,id:participant.id,name:participant.name,amount:n.amount,address:participant.address,description:n.kind+' '+n.number+(n.description?' - '+n.description:''),operation:direction==='prestados'?'1':'0'});
  }
  if(!result.length)throw new Error('Nenhuma nota válida para a empresa e o movimento escolhidos. Verifique o CNPJ, as canceladas e a opção tomados/prestados.');
  return {notes:result,ownId,cents:result.reduce((a,n)=>a+Math.round(n.amount*100),0),duplicates,cancelled,outside};
}
