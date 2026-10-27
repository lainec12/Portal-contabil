// Loader local de PDF.js 5.6.205. O módulo completo é montado no navegador a partir de partes do próprio Portal Contábil.
const chunks=await Promise.all(Array.from({length:16},async(_,i)=>{const u=new URL('../payload-30d735b938/pdf-'+String(i).padStart(3,'0')+'.txt',import.meta.url);const r=await fetch(u);if(!r.ok)throw new Error('Falha ao carregar PDF.js');return r.text()}));
const url=URL.createObjectURL(new Blob(chunks,{type:'text/javascript'}));const api=await import(url);
export const getDocument=api.getDocument;export const GlobalWorkerOptions=api.GlobalWorkerOptions;
