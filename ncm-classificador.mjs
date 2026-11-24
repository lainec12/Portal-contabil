// NCM: pesquisa assistida por correspondência textual, sem classificação fiscal automática.
// A tabela é importada pelo usuário do Portal Único (JSON ou XLSX).
export const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const digits = value => String(value ?? '').replace(/\D/g,'');
const stop = new Set('de da do dos das para por com sem uma um em ao aos as os no na nos nas e ou outros outras partes aparelhos produtos mercadorias semelhantes tipos tipo'.split(' '));
export function tokens(value) { return [...new Set(norm(value).split(/\s+/).filter(t=>t.length>2&&!stop.has(t)))]; }
export function extractNCMS(json) {
 const out=new Map();let visits=0;
 const walk=(data,depth=0)=>{
  if(depth>14||++visits>250000)return;
  if(Array.isArray(data)){for(const item of data)walk(item,depth+1);return;}
  if(!data||typeof data!=='object')return;
  const code=digits(data.codigo ?? data.Codigo ?? data.ncm ?? data.NCM ?? data.codigoNcm ?? data.CodigoNcm ?? '');
  const description=data.descricao ?? data.Descricao ?? data.description ?? data.texto ?? data.Texto ?? '';
  if(code.length===8 && typeof description==='string'&&description.trim())out.set(code,{code,description:description.trim()});
  for(const [key,val] of Object.entries(data)){
    if(val&&typeof val==='object')walk(val,depth+1);
  }
 };
 walk(json);
 return [...out.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
export function score(query,candidate) {
 const q=tokens(query),words=new Set(tokens(candidate.description)),name=norm(candidate.description),phrase=norm(query);
 if(!q.length)return 0;
 let hits=0;for(const word of q)if(words.has(word)||[...words].some(w=>w.startsWith(word)&&word.length>3))hits++;
 const coverage=hits/q.length;
 return Math.round(coverage*85+(phrase&&name.includes(phrase)?15:0));
}
export function suggest(query,list,limit=12) {
 const numeric=digits(query);
 if(numeric.length>=4 && /^\d[\d .-]*$/.test(query.trim()))return list.filter(x=>x.code.startsWith(numeric)).slice(0,limit).map(x=>({...x,match:100}));
 return list.map(x=>({...x,match:score(query,x)})).filter(x=>x.match>=25).sort((a,b)=>b.match-a.match||a.code.localeCompare(b.code)).slice(0,limit);
}
