// Web Worker de análise NCM — processamento local de até 100.000 produtos.
importScripts('./vendor/xlsx.full.min.js');
const send=(type,extras={})=>self.postMessage({type,...extras});
const fields=['Cód. do prod','Descrição','NCM','NCM correto'];
const sheet=(data,cols)=>{const ws=self.XLSX.utils.aoa_to_sheet(data,{dense:true});ws['!cols']=cols.map(w=>({wch:w}));ws['!autofilter']={ref:'A1:'+String.fromCharCode(64+data[0].length)+data.length};return ws;};
async function analyze({buffer,catalog,date,company={}}){
 const {prepareProducts,evaluateProduct,createNcmIndex}=await import('./ncm-planilha.mjs');
 const x=self.XLSX;
 if(!x)throw Error('Biblioteca Excel indisponível no worker');
 send('phase',{label:'Lendo Excel em processamento paralelo...',percent:3});
 const wb=x.read(buffer,{type:'array',dense:true,cellDates:false,bookVBA:false});
 const source=wb.Sheets[wb.SheetNames[0]];
 if(!source)throw Error('Planilha sem aba de produtos');
 send('phase',{label:'Identificando colunas e produtos...',percent:9});
 const rows=x.utils.sheet_to_json(source,{defval:'',raw:false,blankrows:false});
 if(!rows.length)throw Error('Planilha vazia.');
 if(rows.length>100000)throw Error('Limite de 100.000 produtos. Encontradas '+rows.length+' linhas.');
 send('phase',{label:'Preparando índice NCM com descrição e hierarquia...',percent:16});
 const index=createNcmIndex(catalog,date);
 if(!index.records.length)throw Error('Nenhum NCM vigente na data de referência.');
 let suggested=0,validOriginal=0,without=0,count=0,accepted=0,filled=0,divergent=0,insufficient=0;
 const limit=rows.length,chunkSize=200;
 for(let start=0;start<limit;start+=chunkSize){
  const raw=rows.slice(start,Math.min(start+chunkSize,limit));
  const products=prepareProducts(raw,start+2);
  const batch=[];
  for(const p of products){
   const r=evaluateProduct(p,index,date,company);
   if(r.autoSuggestion)suggested++;
   if(!r.correct)without++;else filled++;
   if(r.currentExists)validOriginal++;
   if(r.technicalStatus==='possível incompatibilidade')divergent++;
   if(r.technicalStatus==='informações insuficientes')insufficient++;
   accepted++;
   batch.push({
    productCode:r.productCode,description:r.description,suppliedNcm:r.suppliedNcm,
    correct:r.correct,enteredCorrect:r.enteredCorrect,autoSuggestion:r.autoSuggestion,
    originalStatus:r.originalStatus,status:r.status,reason:r.reason,
    candidateCode:r.candidateCode,officialDescription:r.officialDescription,
    officialContext:r.officialContext,originalDescription:r.originalDescription,
    originalContext:r.originalContext,match:r.match,
    priority:r.priority,sourceType:r.sourceType,
    obs:r.obs,currentExists:r.currentExists,technicalStatus:r.technicalStatus,technicalProblem:r.technicalProblem,
    technicalEvidence:r.technicalEvidence,missingAttributes:r.missingAttributes,
    alternatives:r.alternatives,row:r.row
   });
  }
  count=Math.min(start+chunkSize,limit);
  send('batch',{rows:batch,processed:count,total:limit,suggested,validOriginal,percent:Math.floor(20+76*count/limit)});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 send('done',{processed:count,total:limit,accepted,suggested,without,filled,validOriginal,divergent,insufficient,date});
}
async function exportXlsx({rows,date,source,company={}}){
 const x=self.XLSX;
 if(!x)throw Error('Biblioteca Excel indisponível no worker.');
 if(!Array.isArray(rows)||rows.length>100000)throw Error('Máximo de 100.000 produtos por exportação.');
 send('phase',{label:'Preparando cinco colunas e auditoria fiscal...',percent:12});
 await new Promise(resolve=>setTimeout(resolve,0));
 const wb=x.utils.book_new();
 const main=[[...fields,'OBS'],...rows.map(r=>[String(r.productCode??''),String(r.description??''),String(r.suppliedNcm??''),String(r.correct??''),String(r.obs??'CONFERIR — proposta não confirmada')])];
 x.utils.book_append_sheet(wb,sheet(main,[21,54,18,19,90]),'Classificação NCM');
 send('phase',{label:'Preparando motivos e pendências para cada produto...',percent:31});
 await new Promise(resolve=>setTimeout(resolve,0));
 const detail=[
 ['Cód. do prod','NCM informado','Existe / Vigência','NCM proposto','Descrição oficial da proposta','Contexto de capítulo / posição','Correspondência textual (%)','Resultado da proposta','Motivo / análise','Alternativas NCM','Origem da proposta','Prioridade da revisão','Avaliação técnica','Problema técnico identificado','Evidências da descrição','Informações faltantes'],
 ...rows.map(r=>[
  String(r.productCode??''),String(r.suppliedNcm??''),String(r.originalStatus??''),
  String(r.candidateCode??''),String(r.officialDescription??''),
  String(r.officialContext??''),r.match??'',
  String(r.status??''),String(r.reason??''),Array.isArray(r.alternatives)?r.alternatives.join(' | '):'',
  String(r.sourceType??''),String(r.priority??''),
  String(r.technicalStatus??''),String(r.technicalProblem??''),String(r.technicalEvidence??''),String(r.missingAttributes??'')
 ])
 ];
 x.utils.book_append_sheet(wb,sheet(detail,[21,18,36,19,57,74,26,36,86,36,24,32,33,80,76,82]),'Auditoria NCM');
 const originals=rows.filter(r=>r.currentExists===true).length;
 const proposed=rows.filter(r=>r.autoSuggestion).length;
 const reviewed=rows.filter(r=>r.enteredCorrect).length;
 const unfilled=rows.filter(r=>!r.correct).length;
 const divergent=rows.filter(r=>r.technicalStatus==='possível incompatibilidade').length;
 const insufficient=rows.filter(r=>r.technicalStatus==='informações insuficientes').length;
 const overview=[
 ['RESUMO DE CLASSIFICAÇÃO NCM','Valor'],
 ['Produtos importados',rows.length],
 ['NCM informado vigente na data de referência',originals],
 ['Novas propostas para NCM não vigente',proposed],
 ['NCM original mantido como proposta de conferência',originals],
 ['Total de propostas preenchidas',rows.filter(r=>r.correct).length],
 ['Produtos com NCM correto preenchido pelo arquivo de origem',reviewed],
 ['Sem proposta por informação insuficiente',unfilled],
 ['NCMs com possível incompatibilidade técnica',divergent],
 ['Produtos sem detalhes para validação técnica',insufficient],
 ['CNPJ (contexto informado)',company.cnpj||'Não informado'],
 ['Ramo / CNAE (contexto, não comprovação)',company.activity||'Não informado'],
 ['Data da base de classificação',date||'Não informada'],
 ['Base NCM',source||'Tabela importada pelo Fiscora'],
 ['OBSERVAÇÃO','NCM correto é uma proposta e NÃO uma classificação validada. A auditoria avalia apenas informações presentes na descrição. Código existente não implica compatibilidade.'],
 ['MÉTODO','Família do produto, função, material declarado, incompatibilidades típicas e confronto com descrição oficial da NCM. Conferir regras legais e NESH.'],
 ['AUDITORIA','Aba Auditoria NCM traz os candidatos, motivos de revisão e a situação do NCM original.']
 ];
 x.utils.book_append_sheet(wb,sheet(overview,[64,120]),'Resumo');
 send('phase',{label:'Gerando e compactando a planilha Excel...',percent:65});
 await new Promise(resolve=>setTimeout(resolve,0));
 const result=x.write(wb,{type:'array',bookType:'xlsx',compression:true});
 const out=result instanceof Uint8Array?result:new Uint8Array(result);
 self.postMessage({type:'exported',buffer:out.buffer,bytes:out.byteLength},[out.buffer]);
}
self.onmessage=async ({data})=>{
 try{
  if(data?.type==='analyze')await analyze(data);
  else if(data?.type==='export')await exportXlsx(data);
  else throw Error('Operação NCM não reconhecida.');
 }catch(e){send('error',{message:e instanceof Error?e.message:String(e)})}
};
