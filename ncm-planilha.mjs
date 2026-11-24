// Layout obrigatório para análise em lote: código do produto | descrição | NCM | NCM correto.
// "NCM correto" é proposto para revisão, nunca confirmado automaticamente.
import {norm,digits,suggest} from './ncm-classificador.mjs';
const cleanHeader = value => norm(value).replace(/\s/g,'');
const get = (row,keys) => {
 const m=new Map(Object.entries(row).map(([key,value])=>[cleanHeader(key),value]));
 for(const k of keys){ const v=m.get(k); if(v!==undefined && v!==null && String(v).trim()!=='')return String(v).trim(); }
 return '';
};
export function prepareProducts(rows){
 return rows.map((r,i)=>{
   const productCode=get(r,['codprod','codigoproduto','codigodoproduto','codproduto','coditem','codigo','sku']);
   const description=get(r,['descricao','descricaodoproduto','descritem','descrcompl','produto','xprod']);
   const suppliedNcm=digits(get(r,['ncm','ncminformado','codncm']));
   const enteredCorrect=digits(get(r,['ncmcorreto']));
   if(!productCode&&!description&&!suppliedNcm)return null;
   return {row:i+2,productCode,description,suppliedNcm,enteredCorrect};
 }).filter(Boolean);
}
export function evaluateProduct(p,catalog){
 const existing=catalog.find(x=>x.code===p.suppliedNcm);
 const candidate=p.description?suggest(p.description,catalog,2):[];
 const first=candidate[0]||null,second=candidate[1]||null;
 const ambiguous=!first || first.match<60 || (second && first.match-second.match<15);
 const suggested=ambiguous?'':first.code;
 const correct=p.enteredCorrect||suggested;
 const status=p.enteredCorrect?'Informado na planilha; conferir':!suggested?'Sem correspondência suficiente; revisar':'Sugestão textual; revisar';
 return {...p,correct,autoSuggestion:suggested,match:first?.match??null,officialDescription:first?.description||'',currentExists:!!existing,status,alternatives:candidate.map(x=>x.code)};
}
export function outputRows(items){return items.map(x=>({
 'Cód. do prod':x.productCode,
 'Descrição':x.description,
 'NCM':x.suppliedNcm,
 'NCM correto':x.correct
}));}
