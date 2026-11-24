// Classificação NCM por planilha. Busca indexada para suportar milhares de produtos.
// O campo "NCM correto" é uma SUGESTÃO textual revisável; não é classificação homologada.
import {norm,digits,tokens,score,isValidOn} from './ncm-classificador.mjs';
const cleanHeader=value=>norm(value).replace(/\s/g,'');
const get=(row,keys)=>{
 const m=new Map(Object.entries(row).map(([k,v])=>[cleanHeader(k),v]));
 for(const key of keys){const v=m.get(key);if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim()}
 return '';
};
export function prepareProducts(rows,firstLine=2){
 return rows.map((r,i)=>{
  const productCode=get(r,['coddoprod','codprod','codigoproduto','codigodoproduto','codproduto','coditem','codigo','sku']);
  const description=get(r,['descricao','descricaodoproduto','descritem','descrcompl','produto','xprod']);
  const suppliedNcm=digits(get(r,['ncm','ncminformado','codncm']));
  const enteredCorrect=digits(get(r,['ncmcorreto']));
  if(!productCode&&!description&&!suppliedNcm)return null;
  return {row:i+firstLine,productCode,description,suppliedNcm,enteredCorrect};
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
  for(const word of new Set([...tokens(entry.description),...tokens(entry.context||'')])){
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
// Heurísticas de TRIAGEM, não decisões fiscais. Aplicadas somente quando o NCM original não existe.
// Toda regra demanda conferir o produto real e sua documentação técnica.
const triageRules=[
 {pattern:/motor (de )?(partida|arranque)/,code:'85114000',detail:'Identificação textual de motor de partida; conferir se é motor completo.'},
 {pattern:/limpador universal|preparacao de limpeza/,code:'34025000',detail:'Possível preparação de limpeza para varejo; confirmar composição e apresentação.'},
 {pattern:/eixo s\b|kit reparo.*eixo s/,code:'87083090',detail:'Possível parte de freio de veículo; verificar componentes do kit e aplicação.'},
 {pattern:/flange.*cardan|cardan.*flange/,code:'87089990',detail:'Possível parte automotiva; conferir se outra posição de transmissão é mais específica.'},
 {pattern:/suporte.*filtro.*diesel|suporte.*filtro.*combustivel/,code:'84219999',detail:'Possível parte de aparelho filtrante; verificar material, função e se é suporte genérico.'}
];
function triage(description,index,date){
 const name=norm(description);
 for(const rule of triageRules){
  const entry=index.byCode.get(rule.code);
  if(rule.pattern.test(name)&&entry&&isValidOn(entry,date))return {...entry,match:0,rule:rule.detail};
 }
 return null;
}
export function evaluateProduct(p,catalogOrIndex,date='2026-11-24'){
 const index=Array.isArray(catalogOrIndex)?createNcmIndex(catalogOrIndex,date):catalogOrIndex;
 if(!index||!(index.byCode instanceof Map))throw new Error('Base NCM inválida');
 const original=index.byCode.get(p.suppliedNcm);
 const currentExists=!!original&&isValidOn(original,date);
 const manually=index.byCode.get(p.enteredCorrect);
 const manualValid=!!manually&&isValidOn(manually,date);
 const candidates=p.description?indexedSuggestions(p.description,index,3):[];
 const first=candidates[0]||null;
 const gap=first&&candidates[1]?first.match-candidates[1].match:100;
 const strong=first&&first.match>=55&&gap>=7?first:null;
 const rule=(!currentExists&&!manualValid)?triage(p.description,index,date):null;
 const prefixFallback=()=>{
  // Mesmo prefixo não significa que o código seja adequado ao produto: apenas hipótese para investigação.
  if(!/^\d{8}$/.test(p.suppliedNcm))return null;
  for(const length of [6,4]){
   const choices=index.records.filter(x=>x.code.startsWith(p.suppliedNcm.slice(0,length)));
   if(choices.length===1)return {...choices[0],match:0,rule:'Código candidato pelo mesmo prefixo da NCM anterior; sem comprovação fiscal.'};
  }
  return null;
 };
 const fallback=manualValid?manually:currentExists?original:rule||strong||prefixFallback();
 const correct=fallback?.code||'';
 const isTriage=!manualValid&&!currentExists&&!!correct;
 const status=manualValid?'NCM correto já informado no arquivo — conferir':currentExists?'NCM original vigente mantido como proposta — conferir enquadramento':isTriage?'Nova proposta NCM de triagem — REVISÃO OBRIGATÓRIA':'Sem dados para propor NCM válido — REVISÃO OBRIGATÓRIA';
 const reason=manualValid?'Código preenchido pelo operador e presente na base vigente. A adequação ao produto não foi verificada.':
  currentExists?'NCM informado consta na base oficial vigente. Mantido como proposta, NÃO como classificação confirmada. Validar composição, função, matéria e NESH.':
  rule?.rule||((strong&&first)?'Sugestão textual da tabela NCM; conferir função, composição, exclusões e NESH.':fallback?.rule||'Nenhum código seguro a indicar com base nos dados disponíveis.');
 const options=[...new Set([correct,...candidates.map(x=>x.code)].filter(Boolean))].slice(0,4);
 return {...p,correct,autoSuggestion:isTriage?correct:'',currentExists,
  match:currentExists?score(p.description,original):first?.match??null,
  candidateCode:correct,officialDescription:fallback?.description||'',
  officialContext:fallback?.context||'',
  originalDescription:original?.description||'',
  originalContext:original?.context||'',
  originalStatus:!p.suppliedNcm?'NCM original não informado':!original?'NCM original não encontrado na base':currentExists?'NCM original vigente na data consultada':'NCM original fora da vigência na data consultada',
  status,reason,priority:isTriage?'ALTA: código original não vigente':currentExists?'Revisão da adequação ao produto':'Revisão obrigatória',
  alternatives:options,sourceType:manualValid?'informado pelo usuário':currentExists?'NCM do cadastro mantido':rule?'heurística de triagem':strong?'texto da NCM':'prefixo estrutural'};
}
export function outputRows(items){return items.map(x=>({
 'Cód. do prod':x.productCode,
 'Descrição':x.description,
 'NCM':x.suppliedNcm,
 'NCM correto':x.correct
}));}
