import {resolveMunicipality,loadMunicipalities} from './municipios.mjs?v=20261111-ibge';

export async function consultarPrestador(cnpj,catalog,request=fetch){
  if(!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) throw new Error('A consulta exige um CNPJ de estabelecimento.');
  const response=await request('https://brasilapi.com.br/api/cnpj/v1/'+cnpj,{signal:AbortSignal.timeout(15000),referrerPolicy:'no-referrer',credentials:'omit'});
  if(!response.ok) throw Object.assign(new Error(response.status===404?'CNPJ não localizado.':'Consulta indisponível. Tente novamente.'),{status:response.status});
  const data=await response.json();
  if(String(data.cnpj||'').replace(/[./-]/g,'').toUpperCase()!==cnpj) throw new Error('O cadastro retornado não corresponde ao CNPJ.');
  const found=resolveMunicipality({municipality:data.codigo_municipio_ibge,city:data.municipio,uf:data.uf},catalog);
  if(!found.code || (data.codigo_municipio_ibge && String(data.codigo_municipio_ibge)!==found.code)) throw new Error('Município cadastral sem correspondência segura na tabela IBGE.');
  return found;
}

export function mostrarPrestadores(panel,notes,automatic,fillMissing){
  panel.replaceChildren();
  const groups=new Map();
  for(const {provider} of notes){
    if(!provider)continue;
    if(!groups.has(provider.id))groups.set(provider.id,{provider,codes:new Set()});
    groups.get(provider.id).codes.add(provider.address?.municipality||'');
  }
  if(!groups.size)return;
  const intro=document.createElement('p');
  intro.textContent='Município dos prestadores. Ao consultar, somente o CNPJ é enviado à BrasilAPI. Revise as divergências antes de exportar o 0150.';
  panel.append(intro);
  const queue=[];
  for(const {provider,codes} of groups.values()){
    const line=document.createElement('p');
    line.append(provider.name+' · '+provider.id+' ');
    panel.append(line);
    if(provider.id.length===11){line.append('Pessoa física · município conforme XML.');continue}
    const button=document.createElement('button'), result=document.createElement('span');
    button.type='button';button.textContent='Conferir município pelo CNPJ';result.setAttribute('role','status');
    line.append(button,' ',result);
    const check=async()=>{
      button.disabled=true;result.textContent='Consultando…';
      try{
        const catalog=await loadMunicipalities();
        const found=await consultarPrestador(provider.id,catalog);
        if(!panel.contains(line))return;
        fillMissing(provider.id,found.code);
        const cadastro=found.name+'/'+found.uf+' ('+found.code+')';
        result.textContent=[...codes].map(code=>!code?'Município identificado pelo CNPJ: '+cadastro:code===found.code?'Confirmado: '+cadastro:'Divergência. XML: '+code+' · Cadastro: '+cadastro).join(' | ');
      }catch(error){result.textContent='Sem confirmação. '+(error instanceof TypeError||error.name==='TimeoutError'?'Serviço indisponível. Tente novamente.':error.message);return error.status}
      finally{button.disabled=false}
    };
    button.onclick=check;
    queue.push({line,button,check,result});
  }
  if(automatic) void (async()=>{
    for(const item of queue){item.button.disabled=true;item.result.textContent='Aguardando consulta…'}
    let limited=false;
    for(const item of queue){
      if(!panel.contains(item.line))return;
      if(limited){item.button.disabled=false;item.result.textContent='Limite de consultas atingido. Tente mais tarde.';continue}
      limited=(await item.check())===429;
      await new Promise(done=>setTimeout(done,600));
    }
  })();
}
