// NCM: pesquisa assistida baseada na tabela oficial e descrições hierárquicas.
// A classificação fiscal depende de características da mercadoria e das regras legais, não apenas de texto.
export const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const digits=value=>String(value??'').replace(/\D/g,'');
const stop=new Set('de da do dos das para por com sem uma um em ao aos as os no na nos nas e ou outros outras parte partes aparelho aparelhos produto produtos mercadoria mercadorias semelhante semelhantes tipo tipos marca marcas unidade unidades cx pct pacote pcte un und unid cada cor cores modelo linha novo nova pequena pequeno grande grandes'.split(' '));
const singular=word=>{
 if(word.length>5&&word.endsWith('oes'))return word.slice(0,-3)+'ao';
 if(word.length>4&&word.endsWith('ais'))return word.slice(0,-3)+'al';
 if(word.length>4&&word.endsWith('is')&&!word.endsWith('eis'))return word.slice(0,-1);
 if(word.length>4&&word.endsWith('s'))return word.slice(0,-1);
 return word;
};
export function tokens(value){return [...new Set(norm(value).split(/\s+/).map(singular).filter(t=>t.length>=3&&!stop.has(t)))];}
const plainHTML=v=>String(v??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').trim();
// Preserva a descrição do item e também o contexto de capítulo/posição/subposição.
// Muitas NCMs finais têm descrição "Outros", "De algodão" etc.; sem a hierarquia, a busca perde quase tudo.
export function extractNCMS(json){
 const out=new Map(), records=[];
 let visits=0;
 const walk=(data,depth=0)=>{
  if(depth>14||++visits>250000)return;
  if(Array.isArray(data)){for(const item of data)walk(item,depth+1);return;}
  if(!data||typeof data!=='object')return;
  const code=digits(data.codigo??data.Codigo??data.ncm??data.NCM??data.codigoNcm??data.CodigoNcm??'');
  const description=plainHTML(data.descricao??data.Descricao??data.description??data.texto??data.Texto??'');
  if([2,4,5,6,7,8].includes(code.length)&&description)
   records.push({code,description,start:data.Data_Inicio??data.dataInicio??data.dataInicioVigencia??null,end:data.Data_Fim??data.dataFim??null});
  for(const val of Object.values(data))if(val&&typeof val==='object')walk(val,depth+1);
 };
 walk(json);
 const tree=new Map(records.map(item=>[item.code,item]));
 for(const item of records){
  if(item.code.length!==8)continue;
  const levels=[2,4,5,6,7];
  const ancestors=levels.map(len=>tree.get(item.code.slice(0,len))).filter(Boolean);
  const unique=[...new Set(ancestors.map(x=>x.description).filter(x=>x&&!/^(outros?|outras?|demais)$/i.test(norm(x))))];
  const context=unique.join(' · ');
  out.set(item.code,{...item,context});
 }
 return [...out.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
export function score(query,candidate){
 const words=tokens(query),title=tokens(candidate.description||''),context=tokens(candidate.context||'');
 if(!words.length)return 0;
 const direct=new Set(title),hierarchy=new Set(context);
 let found=0,strong=0;
 for(const term of words){
  if(direct.has(term)){found+=1;strong+=1}
  else if(hierarchy.has(term)){found+=.8}
  else if([...direct].some(w=>w.startsWith(term)&&term.length>3)){found+=.85;strong+=.5}
  else if([...hierarchy].some(w=>w.startsWith(term)&&term.length>3))found+=.65;
 }
 const coverage=found/words.length;
 const generic=/^(outros?|outras?|demais|de |para )/i.test(norm(candidate.description));
 const phrase=norm(query)&&norm((candidate.description||'')+' '+(candidate.context||'')).includes(norm(query))?10:0;
 return Math.max(0,Math.min(100,Math.round(coverage*80+Math.min(10,strong*3)+phrase-(generic&&found<1.5?7:0))));
}
export function suggest(query,list,limit=12){
 const numeric=digits(query);
 if(numeric.length>=4&&/^\d[\d .-]*$/.test(query.trim()))
  return list.filter(x=>x.code.startsWith(numeric)).slice(0,limit).map(x=>({...x,match:100}));
 return list.map(x=>({...x,match:score(query,x)}))
  .filter(x=>x.match>=25).sort((a,b)=>b.match-a.match||a.code.localeCompare(b.code)).slice(0,limit);
}
export function parseBrazilDate(value){
 const m=String(value??'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 if(!m)return null;return m[3]+'-'+m[2]+'-'+m[1];
}
export function isValidOn(record,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date??'')))return false;
 const start=parseBrazilDate(record?.start),end=parseBrazilDate(record?.end);
 return (!start||date>=start)&&(!end||date<=end);
}
