import assert from 'node:assert/strict';
import {consultarPrestador} from '../prestadores.mjs';
const cnpj='19131243000197';
const catalog={municipalities:[['3550308','São Paulo','SP']]};
const body={cnpj,municipio:'SAO PAULO',uf:'SP',codigo_municipio_ibge:3550308};
const request=data=>async url=>{assert.equal(url,'https://brasilapi.com.br/api/cnpj/v1/'+cnpj);return {ok:true,json:async()=>data}};
assert.equal((await consultarPrestador(cnpj,catalog,request(body))).code,'3550308');
await assert.rejects(consultarPrestador(cnpj,catalog,request({...body,cnpj:'00000000000000'})),/corresponde/);
await assert.rejects(consultarPrestador(cnpj,catalog,request({...body,uf:'GO'})),/correspondência/);
await assert.rejects(consultarPrestador('12345678901',catalog,request(body)),/exige/);
await assert.rejects(consultarPrestador(cnpj,catalog,async()=>({ok:false,status:503})),/indisponível/);

const {mostrarPrestadores}=await import('../prestadores.mjs');
class Element {
  children=[];
  append(...items){this.children.push(...items)}
  replaceChildren(){this.children=[]}
  setAttribute(){}
  contains(node){return this.children.includes(node)}
}
globalThis.document={createElement:()=>new Element()};
const panel=new Element(),calls=[],filled=[];
globalThis.fetch=async url=>{
  if(String(url).endsWith('.json'))return {ok:true,json:async()=>({municipalities:Array(5501).fill(catalog.municipalities[0])})};
  calls.push(url);return request(body)(url);
};
const notes=['3550308','5208707',''].map(municipality=>({provider:{id:cnpj,name:'Teste',address:{municipality}}}));
notes.push({provider:{id:'12345678901',address:{}}});
mostrarPrestadores(panel,notes,true,(...args)=>filled.push(args));
await new Promise(done=>setTimeout(done,30));
assert.equal(calls.length,1);
assert.deepEqual(filled,[[cnpj,'3550308']]);
const result=panel.children[1].children.at(-1).textContent;
for(const word of ['Confirmado','Divergência','identificado pelo CNPJ'])assert.ok(result.includes(word));
