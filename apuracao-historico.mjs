// Histórico portátil da apuração. Não envia dados, não usa servidor, não grava automaticamente.
const init = () => {
  const form = document.getElementById('form');
  if (!form || document.getElementById('ap-history')) return;
  const row = document.createElement('div');
  row.id='ap-history';row.className='actions';row.style.margin='12px 0';
  const save=document.createElement('button');save.type='button';save.textContent='Exportar sessão (.json)';
  const label=document.createElement('label');label.textContent='Reabrir sessão (.json)';label.style.display='inline-block';label.style.margin='0 12px';
  const upload=document.createElement('input');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','Selecionar sessão fiscal para reabrir');label.append(upload);
  const status=document.createElement('span');status.setAttribute('role','status');status.className='muted';
  row.append(save,label,status);
  form.append(row);
  const fields=['regime','periodo','receita','icmsDebito','icmsCredito','pisDebito','pisCredito','cofinsDebito','cofinsCredito','outros'];
  save.onclick=()=>{
    const data={format:'fiscora-apuracao-session',version:1,exportedAt:new Date().toISOString(),fields:Object.fromEntries(fields.map(id=>[id,document.getElementById(id)?.value ?? '']))};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download='fiscora-apuracao-'+(data.fields.periodo||'sem-competencia')+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Arquivo de sessão gerado neste navegador.';
  };
  upload.onchange=async()=>{
    const file=upload.files?.[0];if(!file)return;
    try {
      if(file.size>100000)throw Error('Arquivo de sessão maior que 100 KB.');
      const data=JSON.parse(await file.text());
      if(data?.format!=='fiscora-apuracao-session'||data?.version!==1||!data.fields||typeof data.fields!=='object')throw Error('Este arquivo não é uma sessão de apuração reconhecida.');
      const set = {};
      for(const id of fields){
        const v=data.fields[id];
        if(typeof v!=='string')throw Error('Campo inválido: '+id);
        if(id==='regime'){if(!['simples','real','presumido','outro'].includes(v))throw Error('Regime inválido.')}
        else if(id==='periodo'){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))throw Error('Competência inválida.')}
        else if(!Number.isFinite(Number(v))||Number(v)<0||v.length>24)throw Error('Valor inválido: '+id);
        set[id]=v;
      }
      for(const [id,v] of Object.entries(set))document.getElementById(id).value=v;
      form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
      status.textContent='Sessão restaurada; relatório recalculado a partir dos valores do arquivo.';
    }catch(e){status.textContent='Não foi possível reabrir: '+e.message;}
    finally{upload.value='';}
  };
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
