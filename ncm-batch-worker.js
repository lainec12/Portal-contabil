// Worker dedicado a processamento local de ate 100 mil produtos.
// Nao envia planilhas para nenhum servidor. Executa leitura, analise e exportacao fora da thread da tela.
importScripts('./vendor/xlsx.full.min.js');
const send=(type,extra={})=>self.postMessage({type,...extra});
async function analyze({buffer,catalog,date}){
 send('phase',{label:'Lendo a planilha Excel sem bloquear a página...',percent:3});
 const {prepareProducts,evaluateProduct,createNcmIndex}=await import('./ncm-planilha.mjs');
 const x=self.XLSX;
 if(!x)throw new Error('Biblioteca Excel indisponível no processamento paralelo.');
 const wb=x.read(buffer,{type:'array',dense:true,cellDates:false,bookVBA:false});
 const sheet=wb.Sheets[wb.SheetNames[0]];
 if(!sheet)throw new Error('Arquivo sem aba de produtos.');
 send('phase',{label:'Extraindo linhas e identificando colunas...',percent:9});
 const rows=x.utils.sheet_to_json(sheet,{defval:'',raw:false,blankrows:false});
 if(rows.length>100000)throw new Error('A planilha tem '+rows.length+' linhas. Limite de 100.000 produtos por arquivo.');
 if(!rows.length)throw new Error('A planilha não contém produtos.');
 send('phase',{label:'Preparando índice dos '+catalog.length.toLocaleString('pt-BR')+' NCMs...',percent:17});
 const index=createNcmIndex(catalog,date);
 if(!index.records.length)throw new Error('Nenhum NCM vigente disponível para a data de referência.');
 const total=rows.length,chunkSize=300;
 let count=0,suggestions=0,withoutSuggestion=0;
 for(let start=0;start<total;start+=chunkSize){
  const end=Math.min(total,start+chunkSize),raw=rows.slice(start,end);
  const products=prepareProducts(raw,start+2),batch=[];
  for(const p of products){
   const r=evaluateProduct(p,index,date);
   if(r.autoSuggestion)suggestions++;
   else withoutSuggestion++;
   batch.push({
    productCode:r.productCode,description:r.description,
    suppliedNcm:r.suppliedNcm,correct:r.correct,
    autoSuggestion:r.autoSuggestion,originalStatus:r.originalStatus,
    status:r.status,match:r.match,row:r.row
   });
  }
  count=end;
  send('batch',{rows:batch,processed:count,total,percent:Math.round(20+75*count/total)});
  // Coopera com a fila de mensagens do worker e permite atualizar o progresso visivel.
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 send('done',{processed:count,total,valid:suggestions+withoutSuggestion,suggestions,withoutSuggestion});
}
async function exportXlsx({rows}){
 const x=self.XLSX;
 if(!x)throw new Error('Biblioteca Excel indisponível para exportação.');
 if(!Array.isArray(rows)||rows.length>100000)throw new Error('Quantidade de produtos excede o limite de 100.000.');
 send('phase',{label:'Montando arquivo Excel com '+rows.length.toLocaleString('pt-BR')+' produtos...',percent:15});
 await new Promise(resolve=>setTimeout(resolve,0));
 const header=['Cód. do prod','Descrição','NCM','NCM correto'];
 const worksheet=x.utils.aoa_to_sheet([header,...rows.map(r=>[
  String(r.productCode??''),String(r.description??''),
  String(r.suppliedNcm??''),String(r.correct??'')
 ])],{dense:true});
 worksheet['!cols']=[{wch:20},{wch:54},{wch:18},{wch:20}];
 const book=x.utils.book_new();x.utils.book_append_sheet(book,worksheet,'Classificação NCM');
 send('phase',{label:'Compactando Excel. A página continua disponível...',percent:65});
 await new Promise(resolve=>setTimeout(resolve,0));
 const result=x.write(book,{type:'array',bookType:'xlsx',compression:true});
 const out=result instanceof Uint8Array?result:new Uint8Array(result);
 self.postMessage({type:'exported',buffer:out.buffer,bytes:out.byteLength},[out.buffer]);
}
self.onmessage=async event=>{
 const data=event.data||{};
 try{
  if(data.type==='analyze')await analyze(data);
  else if(data.type==='export')await exportXlsx(data);
  else throw new Error('Operação desconhecida do processamento NCM.');
 }catch(error){
  send('error',{message:error instanceof Error?error.message:String(error)});
 }
};
