// Motor de cálculo preliminar PIS/COFINS — não emite guia e não substitui EFD-Contribuições.
// A classificação tributária é definida pelo operador por operação; NCM isolado é insuficiente.
export const round = n => Math.round((n+Number.EPSILON)*100)/100;
const rates = {
  'nao-cumulativo':{pis:0.0165,cofins:0.076},
  'cumulativo':{pis:0.0065,cofins:0.03},
  'simples':{pis:0,cofins:0}
};
export const categories = ['tributado','monofasico','zero','revisao'];
export function parseMoney(value) {
 const valueString=String(value??'').trim().replace(/[R$\s]/g,'');
 const n=valueString.includes(',')?Number(valueString.replace(/\./g,'').replace(',','.')):Number(valueString);
 if(!Number.isFinite(n)||n<0)throw new Error('Valor inválido ou negativo: '+value);
 return round(n);
}
export function analyzeOperation(item,regime) {
 if(!rates[regime])throw new Error('Regime desconhecido');
 if(!['saida','entrada'].includes(item.type))throw new Error('Tipo de operação inválido');
 if(!categories.includes(item.category))throw new Error('Classificação não informada');
 const value=parseMoney(item.value),icms=parseMoney(item.icms??0);
 if(icms>value)throw new Error('ICMS superior ao valor da operação: '+(item.description||item.document||'item'));
 const defaultInfo={...item,value,icms,base:0,pis:0,cofins:0,note:'',eligible:false,unclassified:false};
 if(regime==='simples')return {...defaultInfo,note:'Simples Nacional: segregação de receita no PGDAS-D; o cálculo não representa o DAS.'};
 if(item.category==='revisao')return {...defaultInfo,unclassified:true,note:'Regra especial ou não definida: não incluída na apuração automática.'};
 if(item.type==='saida') {
  if(item.category==='monofasico')return {...defaultInfo,note:'Revenda monofásica informada: tributação concentrada anteriormente; conferir NCM, produto, posição na cadeia, CST 04 e legislação.'};
  if(item.category==='zero')return {...defaultInfo,note:'Operação informada com alíquota zero: conferir hipótese legal e CST 06.'};
  const base=round(value-icms);
  return {...defaultInfo,base,pis:round(base*rates[regime].pis),cofins:round(base*rates[regime].cofins),note:'Base demonstrativa = valor da receita − ICMS destacado informado. Conferir exclusões permitidas e regime.'};
 }
 // Entradas: só destacar crédito quando o usuário assinalou expressamente elegibilidade.
 if(regime!=='nao-cumulativo')return {...defaultInfo,note:'Regime cumulativo: sem crédito habitual da sistemática não cumulativa.'};
 if(item.category==='monofasico')return {...defaultInfo,note:'Aquisição de produto sujeito à incidência monofásica para revenda: crédito típico não considerado; verificar operação.'};
 if(item.category==='zero')return {...defaultInfo,note:'Aquisição sujeita à alíquota zero: não presumir crédito. Analisar hipótese e legislação específica.'};
 if(item.creditEligible!==true)return {...defaultInfo,note:'Elegibilidade ao crédito não confirmada para esta aquisição. Sem crédito automático.'};
 const base=round(value-icms);
 return {...defaultInfo,base,pis:round(base*rates[regime].pis),cofins:round(base*rates[regime].cofins),eligible:true,note:'Crédito demonstrativo expressamente autorizado pelo operador. Base = valor da aquisição − ICMS incidente informado. Validar hipótese e escrituração.'};
}
export function calculatePisCofins({regime,period,company='',operations=[]}){
 if(!rates[regime])throw new Error('Regime de PIS/COFINS inválido');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Competência inválida. Informe AAAA-MM.');
 if(!Array.isArray(operations)||operations.length>10000)throw new Error('Lista de operações inválida ou excessiva.');
 const detailed=operations.map((item,i)=>({...analyzeOperation(item,regime),index:i+1}));
 const summary=type=>detailed.filter(x=>x.type===type).reduce((sum,x)=>({
   amount:round(sum.amount+x.value),base:round(sum.base+x.base),
   pis:round(sum.pis+x.pis),cofins:round(sum.cofins+x.cofins),
   count:sum.count+1
 }),{amount:0,base:0,pis:0,cofins:0,count:0});
 const debit=summary('saida'),credit=summary('entrada');
 const pisBalance=round(debit.pis-credit.pis),cofinsBalance=round(debit.cofins-credit.cofins);
 return {regime,period,company,detailed,debit,credit,pisBalance,cofinsBalance,
   pisPayable:Math.max(0,pisBalance),cofinsPayable:Math.max(0,cofinsBalance),
   pisCredit:Math.max(0,round(-pisBalance)),cofinsCredit:Math.max(0,round(-cofinsBalance)),
   pending:detailed.filter(x=>x.unclassified).length,
   notes:'Demonstrativo, não apuração definitiva. Revisar diferenças da EFD-Contribuições, saldos anteriores, retenções, regimes especiais, exclusões e escrituração. Saldo credor não implica restituição automática.'};
}
