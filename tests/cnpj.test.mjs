import assert from 'node:assert/strict';
import {validCnpj,prepare,classify,company,lookup,exportRows} from '../cnpj-cnae.mjs';
for (const id of ['00000000000191','11.222.333/0001-81','12.ABC.345/01DE-35']) assert.ok(validCnpj(id),id);
for (const id of ['00000000000000','11222333000182','123','not-a-cnpj']) assert.equal(validCnpj(id),false,id);
const batch=prepare(['00.000.000/0001-91','00000000000191','bad','']);
assert.equal(batch.duplicates,1);assert.equal(batch.rows.length,2);assert.equal(batch.rows[1].state,'Inválido');
for(const code of ['4639701','4691500','4511103','4530701','4541202'])assert.equal(classify(code),'Atacado');
for(const code of ['4619200','4512901','4530706','4542101'])assert.equal(classify(code),'Representação comercial');
for(const code of ['4711302','4511101','4530703','4541205'])assert.equal(classify(code),'Varejo');
assert.equal(classify(0),'Não informado');assert.equal(classify('6920601'),'Outras atividades');
const fixture={cnpj:'00000000000191',razao_social:'Empresa de teste',cnae_fiscal:4619200,cnae_fiscal_descricao:'Representantes',cnaes_secundarios:[{codigo:4639701,descricao:'Atacado'},{codigo:4711302,descricao:'Varejo'}],municipio:'GOIANIA',uf:'GO',descricao_situacao_cadastral:'ATIVA'};
const mixed=company(fixture);assert.ok(mixed.wholesale);assert.match(mixed.category,/Mista/);assert.equal(mixed.activities[1].origin,'Secundário');
assert.equal(company({...fixture,cnaes_secundarios:[]}).wholesale,false);
assert.throws(()=>company({...fixture,cnaes_secundarios:null}),/incompleta/);
const fetched=await lookup(fixture.cnpj,undefined,async()=>({ok:true,json:async()=>fixture}));assert.equal(fetched.name,fixture.razao_social);
await assert.rejects(lookup(fixture.cnpj,undefined,async()=>({ok:false,status:429})),/Limite/);
await assert.rejects(lookup(fixture.cnpj,undefined,async()=>({ok:false,status:404})),/não localizado/);
await assert.rejects(lookup(fixture.cnpj,undefined,async()=>({ok:true,json:async()=>({...fixture,cnpj:'11222333000181'})})),/outro CNPJ/);
assert.equal(exportRows([{cnpj:'00000000000191',state:'Erro'}])[0]['Possui atacado'],'Não concluído');
console.log('CNPJ: validação numérica/alfanumérica, duplicatas, CNAEs, secundários, erros e exportação OK');


