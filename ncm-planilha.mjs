// Classificação NCM por planilha. Busca indexada para suportar milhares de produtos.
// O campo "NCM correto" é uma SUGESTÃO textual revisável; não é classificação homologada.
import {norm,digits,tokens,score,isValidOn} from './ncm-classificador.mjs';
const cleanHeader=value=>norm(value).replace(/\s/g,'');
const get=(row,keys)=>{
 const m=new Map(Object.entries(row).map(([k,v])=>[cleanHeader(k),v]));
 for(const key of keys){const v=m.get(key);if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim()}
 return '';
};
export function prepareProducts(rows){
 return rows.map((r,i)=>{
  const productCode=get(r,['coddoprod','codprod','codigoproduto','codigodoproduto','codproduto','coditem','codigo','sku']);
  const description=get(r,['descricao','descricaodoproduto','descritem','descrcompl','produto','xprod']);
  const suppliedNcm=digits(get(r,['ncm','ncminformado','codncm']));
  const enteredCorrect=digits(get(r,['ncmcorreto']));
  if(!productCode&&!description&&!suppliedNcm)return null;
  return {row:i+2,productCode,description,suppliedNcm,enteredCorrect};
 }).filter(Boolean);
}
// Construir apenas uma vez por lote; filtrar vigência também apenas uma vez.
// Índice invertido: só pontuar descrições que compartilham termos, jamais 10.516 x cada linha.
export function createNcmIndex(catalog,date='2026-11-24'){
 const records=[],byCode=new Map(),inverted=new Map();
 for(const entry of catalog){
  if(!entry||typeof entry.code!=='string')continue;
  byCode.set(entry.code,entry);
  if(!isValidOn(entry,date))continue;
  const id=records.length;records.push(entry);
  const keys=new Set();
  for(const word of tokens(entry.description)){
   keys.add(word);
   // Inclusão de prefixos para plural e flexões: "camiseta" encontra "camisetas".
   for(let n=4;n<word.length&&n<=14;n++)keys.add(word.slice(0,n));
  }
  for(const word of keys){
   let ids=inverted.get(word);
   if(!ids){ids=[];inverted.set(word,ids)}
   ids.push(id);
  }
 }
 return {records,byCode,inverted,date,cache:new Map()};
}
function indexedSuggestions(description,index,limit=2){
 const query=norm(description);
 if(!query)return [];
 if(index.cache.has(query))return index.cache.get(query).slice(0,limit);
 const ids=new Set();
 for(const word of tokens(description)){
  const idsForWord=index.inverted.get(word);
  if(idsForWord)for(const id of idsForWord)ids.add(id);
 }
 const ranked=[];
 for(const id of ids){
  const entry=index.records[id],match=score(description,entry);
  if(match>=25)ranked.push({...entry,match});
 }
 ranked.sort((a,b)=>b.match-a.match||a.code.localeCompare(b.code));
 const best=ranked.slice(0,4);
 // Cache limitado para evitar acumular grandes planilhas no navegador.
 if(index.cache.size>=2000)index.cache.clear();
 index.cache.set(query,best);
 return best.slice(0,limit);
}
export function evaluateProduct(p,catalogOrIndex,date='2026-11-24'){
 const index=Array.isArray(catalogOrIndex)?createNcmIndex(catalogOrIndex,date):catalogOrIndex;
 if(!index||!(index.byCode instanceof Map))throw new Error('Base NCM inválida');
 const existing=index.byCode.get(p.suppliedNcm);
 const currentExists=!!existing&&isValidOn(existing,date);
 const candidate=p.description?indexedSuggestions(p.description,index,2):[];
 const first=candidate[0]||null,second=candidate[1]||null;
 const ambiguous=!first||first.match<60||(second&&first.match-second.match<15);
 const suggested=ambiguous?'':first.code;
 const correct=p.enteredCorrect||suggested;
 const status=p.enteredCorrect?'Informado na planilha; conferir':!suggested?'Sem correspondência suficiente; revisar':'Sugestão textual; revisar';
 return {...p,correct,autoSuggestion:suggested,match:first?.match??null,officialDescription:first?.description||'',
  currentExists,
  originalStatus:!p.suppliedNcm?'NCM original não informado':!existing?'NCM original não encontrado na base':currentExists?'NCM original vigente na data consultada':'NCM original fora da vigência na data consultada',
  status,alternatives:candidate.map(x=>x.code)};
}
export function outputRows(items){return items.map(x=>({
 'Cód. do prod':x.productCode,
 'Descrição':x.description,
 'NCM':x.suppliedNcm,
 'NCM correto':x.correct
}));}
