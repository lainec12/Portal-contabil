// Loader de worker PDF.js 5.6.205; executa no navegador, sem enviar PDFs ao servidor.
const chunks=await Promise.all(Array.from({length:45},async(_,i)=>{const u=new URL('../payload-30d735b938/worker-'+String(i).padStart(3,'0')+'.txt',import.meta.url);const r=await fetch(u);if(!r.ok)throw new Error('Falha ao carregar worker PDF.js');return r.text()}));
const url=URL.createObjectURL(new Blob(chunks,{type:'text/javascript'}));await import(url);
