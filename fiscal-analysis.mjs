// Motor de apoio fiscal — não substitui escrituração nem cálculo oficial.
// Valores informados nos documentos são evidências, não créditos homologados.
export const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const nonnegative = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Informe valores numéricos não negativos.');
  return round2(n);
};
export function classifyCredit({regime, direction, cfop = '', csosn = '', cst = '', purpose = ''}) {
  if (!['simples','real','presumido','outro'].includes(regime)) throw new Error('Regime não reconhecido.');
  if (!['Entrada','Saída'].includes(direction)) throw new Error('Operação desconhecida.');
  if (direction === 'Saída') return {status:'não é crédito de entrada',reason:'Tributos em saídas são analisados como débitos, recolhimentos ou segregações, não créditos de compra.'};
  if (regime === 'simples') return {status:'regra geral: vedado',reason:'Empresa optante, em regra, não aproveita créditos dos tributos abrangidos pelo Simples (LC 123/2006, art. 23). Exceções e operações fora do regime exigem análise separada.'};
  if (regime === 'presumido') return {status:'depende do tributo',reason:'PIS/COFINS normalmente cumulativos não geram os créditos típicos da não cumulatividade; ICMS depende da operação, documentação e regras estaduais.'};
  if (regime === 'outro') return {status:'revisão obrigatória',reason:'Regime não confirmado.'};
  if (!cfop || !cst || !purpose) return {status:'revisão obrigatória',reason:'Faltam CFOP, CST e finalidade efetiva para validar ICMS/PIS/COFINS.'};
  if (/^(1|2|3)/.test(cfop)) return {status:'potencial sujeito à análise',reason:'No Lucro Real, ICMS e créditos de PIS/COFINS podem depender de não cumulatividade, destinação, CST, ST, monofásicos, benefícios e documentação. Não apropriado automaticamente.'};
  return {status:'revisão obrigatória',reason:'CFOP informado não é típico de entrada; conferir a operação.'};
}
export function apuracaoAssistida({regime, periodo, receita, icmsDebito, icmsCredito, pisDebito, pisCredito, cofinsDebito, cofinsCredito, outros, validado}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new Error('Competência inválida. Use AAAA-MM.');
  const input = {receita,icmsDebito,icmsCredito,pisDebito,pisCredito,cofinsDebito,cofinsCredito,outros};
  const amounts=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,nonnegative(v)]));
  const allowedIcms = ['real','presumido'].includes(regime);\n  const allowedContribuicoes = regime === 'real';
  const calc=(debit,credit)=>({debito:debit,credito:credit,saldo:round2(debit-credit),recolher:Math.max(0,round2(debit-credit)),saldoCredor:Math.max(0,round2(credit-debit))});
  return {regime,periodo,receita:amounts.receita,status:(allowedIcms||allowedContribuicoes)?'SIMULAÇÃO COM VALORES INFORMADOS — NÃO É APURAÇÃO DEFINITIVA':'DEMONSTRATIVO PRELIMINAR — CRÉDITOS NÃO APLICADOS NO SIMPLES OU REGIME NÃO CONFIRMADO',icms:calc(amounts.icmsDebito,allowedIcms?amounts.icmsCredito:0),pis:calc(amounts.pisDebito,allowedContribuicoes?amounts.pisCredito:0),cofins:calc(amounts.cofinsDebito,allowedContribuicoes?amounts.cofinsCredito:0),outros:amounts.outros,creditoInformadoNaoAplicado:round2((allowedIcms?0:amounts.icmsCredito)+(allowedContribuicoes?0:amounts.pisCredito+amounts.cofinsCredito)),observacoes:regime==='simples'?'Simples Nacional: não usar saldos de ICMS/PIS/COFINS como DAS. Fazer segregação de receita, RBT12, anexos e cálculo oficial no PGDAS-D; eventuais tributos fora do DAS devem ser analisados à parte.' :regime==='presumido'?'Lucro Presumido: PIS/COFINS normalmente sujeitos ao regime cumulativo, sem a apropriação habitual dos créditos da não cumulatividade; valores informados aparecem como não aplicados. Conferir exceções, ajustes e escrituração.':'Verificar saldos anteriores, retenções, ajustes, estornos, base legal, regimes especiais e escriturações antes de recolher.'};
}
export function auditXml({notes=[],events=[]}) {
 const issues=[],unique=new Map(),seen=new Set(),cancel=new Set();
 for (const evt of events) if (evt.code==='110111' && evt.accepted===true && /^\d{44}$/.test(evt.key)) cancel.add(evt.key);
 for (const note of notes) {
   if(!/^\d{44}$/.test(note.key||'')){issues.push('Chave de NF-e inválida');continue;}
   if(seen.has(note.key)){issues.push('XML duplicado: '+note.key);continue;}
   seen.add(note.key);
   if(note.type!=='Entrada' && note.type!=='Saída'){issues.push('Operação sem classificação: '+note.key);continue;}
   if(!note.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(note.month))issues.push('Competência ausente ou inválida: '+note.key);
   if(!Number.isFinite(note.value)||note.value<0)issues.push('Valor inválido: '+note.key);
   unique.set(note.key,{...note,cancelled:cancel.has(note.key)});
 }
 const result=[...unique.values()];
 const eligible=result.filter(n=>!n.cancelled && Number.isFinite(n.value)&&n.value>=0);
 const byType=type=>{const a=eligible.filter(n=>n.type===type);return {quantidade:a.length,valor:round2(a.reduce((s,n)=>s+n.value,0))};};
 return {totalLidos:notes.length,unicos:result.length,cancelados:result.filter(n=>n.cancelled).length,entradas:byType('Entrada'),saidas:byType('Saída'),issues};
}
