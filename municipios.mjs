const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[-–]/g,' ').replace(/\s+/g,' ').trim();
export function resolveMunicipality(address,catalog){
  const code=String(address?.municipality??'').trim(),name=normalize(address?.city),uf=String(address?.uf||'').trim().toUpperCase();
  const rows=catalog.municipalities||[];
  const exact=/^\d{7}$/.test(code)?rows.find(r=>r[0]===code):null;
  if(exact&&(!uf||uf===exact[2])&&(!name||name===normalize(exact[1])))return {code:exact[0],name:exact[1],uf:exact[2],issue:''};
  if(name&&uf){const matches=rows.filter(r=>normalize(r[1])===name&&r[2]===uf);if(matches.length===1)return {code:matches[0][0],name:matches[0][1],uf:matches[0][2],issue:''}}
  return {code:'',name:address?.city||'',uf,issue:code?'Código ou cidade/UF do XML não confere com a tabela IBGE.':'Município ausente ou cidade/UF insuficientes no XML.'};
}
let promise;
export function loadMunicipalities(){
  return promise??=(async()=>{try{const response=await fetch(new URL('./vendor/ibge-municipios.json',import.meta.url));if(!response.ok)throw new Error();const data=await response.json();if(!Array.isArray(data.municipalities)||data.municipalities.length<5500)throw new Error();return data}catch{promise=null;throw new Error('Não foi possível carregar a tabela IBGE. Atualize a página e tente novamente.')}})();
}
