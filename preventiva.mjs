export const cents=v=>v==null||String(v).trim()===''||!Number.isFinite(Number(String(v).replace(',','.')))?null:Math.round(Number(String(v).replace(',','.'))*100);
export const br=v=>{const s=String(v??'').trim();return /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)?cents(s.replace(/\./g,'')):null};
export function analyze(docs,cnpj,events=new Set()){
 const map=new Map(),alerts=[],groups=new Map(),seq=new Map(),credits=[],returns=[],ctes=[];
 for(const d of docs){
 if(![d.emit,d.dest,d.taker].includes(cnpj))continue;
 if(!/^\d{44}$/.test(d.key)){alerts.push(['Chave inválida',d.period,d.num,d.key,'Revisar XML']);continue}
 if(map.has(d.key)){alerts.push(['Duplicidade',d.period,d.num,d.key,'Não somada']);continue}
 d.direction=d.emit===cnpj?(d.ct?'Prestação':d.tp==='0'?'Entrada própria':'Saída'):(d.ct?'Tomador/destinatário':'Entrada');d.cancelled=d.cancelled||events.has(d.key);map.set(d.key,d);
 if(d.emit===cnpj&&!d.ct&&/^\d+$/.test(d.num)){const k=d.model+'/'+d.series;if(!seq.has(k))seq.set(k,[]);seq.get(k).push(d)}
 if(d.cancelled){alerts.push(['Cancelamento',d.period,d.num,d.key,'Excluído dos valores']);continue}
 if(d.ct){ctes.push(d);continue}
 for(const i of d.items){const k=[d.direction,d.emit,i.code,i.ncm,i.cfop].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push({...i,doc:d});
 if(d.direction.startsWith('Entrada')&&[i.icms,i.pis,i.cofins].includes(0))credits.push([d.period,d.num,d.key,i.code,i.ncm,i.cfop,i.icms,i.pis,i.cofins,'Imposto zero no XML: revisar elegibilidade; não estima crédito']);
 if(!/^\d{8}$/.test(i.ncm)||!/^[123567]\d{3}$/.test(i.cfop)||i.cst&&!/^\d{2,3}$/.test(i.cst))alerts.push(['Formato NCM/CFOP/CST',d.period,d.num,d.key,i.code+' '+i.ncm+' '+i.cfop+' '+i.cst]);
 }}
 const gaps=[];for(const [k,a] of seq){a.sort((x,y)=>+x.num-+y.num);for(let j=1;j<a.length;j++){let n=+a[j].num-+a[j-1].num-1;if(n>0)gaps.push([k,a[j-1].num,a[j].num,n,'Intervalo no lote; conferir inutilização e abrangência'])}}
 const variation=[];for(const a of groups.values())if(new Set(a.map(i=>[i.cst,i.pisCst,i.cofinsCst,i.rate].join('|'))).size>1)for(const i of a)variation.push([i.doc.period,i.doc.num,i.doc.key,i.code,i.ncm,i.cfop,i.cst,i.pisCst,i.cofinsCst,i.rate,'Tratamento diferente; revisar contexto']);
 for(const d of map.values())if(d.fin==='4'&&!d.cancelled){for(const ref of d.refs.length?d.refs:['']){const o=map.get(ref);if(!o){returns.push([d.period,d.num,d.key,ref,'',null,null,null,null,'Original não localizado']);continue}for(const i of d.items){const m=o.items.filter(x=>x.ncm===i.ncm&&x.description===i.description),a=m.length===1?m[0]:null;returns.push([d.period,d.num,d.key,ref,i.code,i.qty,a?.qty,i.total,a?.total,a?'Revisar devolução parcial, unidade e tributos':'Pareamento inconclusivo'])}}}
 return {map,alerts,gaps,variation,credits,returns,ctes};
}
export function indexEfd(files,kind,cnpj){const map=new Map(),seen=new Set();for(const f of files){if(f.cnpj!==cnpj)throw Error('CNPJ incompatível');if(seen.has(f.period))throw Error('Competência repetida: '+f.period);seen.add(f.period);let active=kind==='fiscal';for(const r of f.rows){if(kind==='contrib'&&r[0]==='C010')active=r[1]===cnpj;if(!active)continue;let c=r[0]==='C100',d=kind==='fiscal'&&r[0]==='D100';if(!c&&!d)continue;const key=r[c?8:9];if(!/^\d{44}$/.test(key||''))continue;if(map.has(key))throw Error('Chave repetida na EFD: '+key);map.set(key,{period:f.period,num:r[c?7:8],model:r[4],status:r[5],value:cents(r[c?11:14])})}}return map}
export function cross(a,b){return [...new Set([...a.keys(),...b.keys()])].map(k=>{const x=a.get(k),y=b.get(k),v=x?.value??null,w=y?.value??null;return [x?.period||y?.period,k,x?.num||y?.num,v,w,v==null||w==null?null:w-v,!x||!y?'Não localizado':v==null||w==null?'Não comparável':Math.abs(w-v)>1?'Revisar':'Confere',x?.status,y?.status]})}
export function reconcile(text){const lines=text.trim().split(/\r?\n/).filter(Boolean),h=lines.shift()?.replace(/^\uFEFF/,'').split(';').map(x=>x.trim().toLowerCase());if(!h||!['competencia','descricao','valor_a','valor_b'].every(x=>h.includes(x)))throw Error('Cabeçalho: competencia;descricao;valor_a;valor_b');return lines.map(l=>{const r=l.split(';'),g=k=>r[h.indexOf(k)]||'',a=br(g('valor_a')),b=br(g('valor_b'));return [g('competencia'),g('descricao'),a,b,a==null||b==null?null:b-a,a==null||b==null?'Não comparável':Math.abs(b-a)>1?'Revisar':'Confere']})}
export const tasks=['Arquivos recebidos','XML e notas conferidos','EFD ICMS/IPI conferida','EFD-Contribuições conferida','Serviços e retenções conferidos','Apuração e guias revisadas','Obrigações entregues','Relatório apresentado'];
