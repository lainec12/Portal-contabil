// Triagem tecnica NCM. Evidencia descritiva nao substitui classificacao fiscal.
import {norm,isValidOn} from './ncm-classificador.mjs';
const e=(key,label,pattern,prefixes,questions=[],codes=[])=>({key,label,pattern,prefixes,questions,codes});
export const PRODUCT_TYPES=[
 e('motor-partida','motor de partida',/\b(motor(?: de)? partida|motor(?: de)? arranque|arrancador)\b/,['8511'],['É o motor de partida completo ou somente um componente?'],['85114000']),
 e('alternador','alternador automotivo',/\b(alternador|gerador automotivo)\b/,['8511'],['É alternador completo ou parte?'],['85115010','85115090']),
 e('correia','correia de transmissão',/\b(correia|belt)\b/,['4010','5910'],['Qual o material? É correia dentada, estriada ou lisa? Quais as dimensões?'],['40103100','40103500']),
 e('mangueira','mangueira/tubo flexível',/\b(mangueira|flexivel|mangote|tubo flexivel)\b/,['4009','3917','8307','8708'],['Qual o material (borracha, silicone, plástico ou metal)? Há conexões ou reforço? Qual a função principal?'],['40091290','40093100','39173240']),
 e('junta','junta de vedação',/\b(junta|guarnicao|gaxeta|vedacao)\b/,['4016','8484','3926','6815','7318'],['De que material é feita a vedação (borracha, metal, fibra etc.)?'],['40169300','84841000']),
 e('retentor','retentor/anel de vedação',/\b(retentor|o[- ]?ring|anel de vedacao)\b/,['4016','8484','3926'],['Qual o material do anel/retentor e se há componentes metálicos?'],['40169300','84842000']),
 e('rolamento','rolamento',/\b(rolamento|bearing)\b/,['8482'],['É de esferas, rolos cônicos, agulhas ou outro tipo?'],['84821010','84822010']),
 e('parafuso','parafuso/pino roscado',/\b(parafuso|prisioneiro|parafusos|perno roscado)\b/,['7318'],['Há rosca? Qual o material e características da peça?'],['73181500']),
 e('porca','porca',/\b(porca|porcas)\b/,['7318'],['Qual material e tipo de porca?'],['73181600']),
 e('filtro','filtro',/\b(filtro|elemento filtrante)\b/,['8421','5911','4812'],['É filtro completo ou elemento? Filtra ar, óleo, combustível ou outro fluido?'],['84212300','84213100','84219999']),
 e('bomba','bomba',/\b(bomba|carcaca de bomba)\b/,['8413','8414'],['É bomba completa ou parte? Fluido e princípio de funcionamento?'],['84133030','84139190']),
 e('valvula','válvula',/\b(valvula|valvulas|solenoide)\b/,['8481','8536','8409','8708'],['Qual função da válvula? É mecânica, eletromagnética, termostática ou parte de motor?'],['84818021','84812090']),
 e('radiador','radiador/trocador térmico',/\b(radiador|intercooler|trocador de calor)\b/,['8708','8419','8409'],['É radiador completo, parte do radiador ou um trocador de calor?'],['87089100']),
 e('freio','componente de freio',/\b(freio|pastilha|lona de freio|tambor de freio|disco de freio|pinca de freio)\b/,['8708','6813'],['É peça exclusivamente do sistema de freios? Qual a função exata?'],['87083090']),
 e('embreagem','embreagem',/\b(embreagem|plat[oô] embreagem)\b/,['8708','8483'],['Conjunto completo, disco, platô ou rolamento?'],['87089300']),
 e('cambio','câmbio/transmissão',/\b(cambio|caixa de marchas|transmissao)\b/,['8708','8483'],['É caixa completa, engrenagem, rolamento, vedação ou outra peça?'],['87084090']),
 e('suspensao','suspensão/amortecedor',/\b(amortecedor|suspensao|barra estabilizadora)\b/,['8708','7320'],['É amortecedor de suspensão ou peça avulsa?'],['87088000']),
 e('escape','escape/silenciador',/\b(escape|silenciador|tubo de escapamento|descarga gases)\b/,['8708','8421'],['É tubo/silenciador do escape, catalisador ou filtro de partículas?'],['87089200']),
 e('farol','farol/lâmpada de sinalização',/\b(farol|lanterna|seta pisca|luz de posicao)\b/,['8512','8539'],['Conjunto de iluminação ou lâmpada avulsa?'],['85122011']),
 e('chicote','chicote/cabo elétrico',/\b(chicote|cabo eletrico|conector|terminal eletrico)\b/,['8544','8536'],['É conjunto de condutores, conector avulso ou terminal? Possui conectores?'],['85444200','85369040']),
 e('sensor','sensor/instrumento',/\b(sensor|pressostato|termistor|transdutor)\b/,['9025','9026','9031','8536','8543'],['Mede pressão, temperatura, nível, posição ou outra grandeza?'],['90262090']),
 e('vedacao','vedação/guarnição',/\b(vedacao|gaxeta)\b/,['4016','8484','3926'],['Material e estrutura da vedação?'],['40169300']),
 e('suporte','suporte/estrutura',/\b(suporte|base de fixacao)\b/,['7326','8302','8708','8421'],['Qual material? É suporte genérico ou parte especializada?'],['73269090']),
 e('tubo','tubo rígido/conexão',/\b(tubo|cano|conexao)\b/,['7304','7306','3917','4009','7412','8708','8413'],['Qual material, função, formato e se possui conexões?'],['73071920','39174090']),
 e('anel','anel/componente circular',/\b(anel|arruela|calco)\b/,['4016','7318','8484','8482'],['Material e função específica da peça?'],['40169300']),
 e('kit','kit/conjunto de reparo',/\b(kit|jogo|reparo|conjunto)\b/,[],['Quais peças compõem o conjunto e qual delas dá a característica essencial?'],[]),
];
const materialIndicators=[
 ['borracha',/\b(borracha|elastomero|epdm|nitrilica|nbr)\b/],
 ['silicone',/\b(silicone|siliconado)\b/],
 ['plástico',/\b(plastico|pvc|poliamida|polipropileno|nylon)\b/],
 ['metal',/\b(metal|aco|ferro|aluminio|inox|cobre)\b/]
];
export function characterizeProduct(value){
 const description=norm(value);
 const ignore=/\b(volvo|scania|mercedes|cummins|fh\d*|fm\d*|d\d\d?|euro \d+|quality line|import|genuina|linha|peca)\b/g;
 const technical=description.replace(ignore,' ').replace(/\b\d{5,}\b/g,' ').trim();
 // Prioridade é o nome da peça, não a aplicação genérica: "mangueira de freio" é mangueira.
 const selected=PRODUCT_TYPES.find(x=>x.pattern.test(technical));
 const materials=materialIndicators.filter(([,p])=>p.test(technical)).map(([name])=>name);
 return {category:selected?.key||'não identificada',label:selected?.label||'Mercadoria não identificada pelo nome',materials,rule:selected,technical};
}
export function auditTechnicalProduct({description,ncm,entry,date='2026-11-24'}){
 const item=characterizeProduct(description),category=item.rule,valid=!!entry&&isValidOn(entry,date);
 const code=String(ncm||'');
 const label=entry?entry.description||'':'Código não localizado na base NCM';
 const context=entry?.context||'';
 const needs=category?category.questions.slice():['Informar o que é a mercadoria, material constitutivo e função principal.'];
 const evidence=[];
 if(category)evidence.push('Tipo reconhecido: '+category.label);
 if(item.materials.length)evidence.push('Material mencionado: '+item.materials.join(', '));
 const group=(category?.prefixes||[]).some(prefix=>code.startsWith(prefix));
 let status='informações insuficientes',problem='',suggestions=[];
 if(!valid){
  status='NCM não vigente/encontrado';
  problem='O NCM informado não consta como vigente na base da data selecionada.';
 }else if(!category){
  status='informações insuficientes';
  problem='A descrição não identifica com precisão o tipo técnico da mercadoria.';
 }else if(!category.prefixes.length){
  status='informações insuficientes';
  problem='Conjunto ou kit exige identificação dos componentes e regra de classificação.';
 }else if(group){
  status='compatibilidade preliminar';
  problem='O código pertence a família potencialmente compatível, mas não foi confirmada a subposição nem as notas legais.';
 }else {
  status='possível incompatibilidade';
  problem='O tipo técnico da mercadoria não corresponde às famílias típicas indicadas pelo NCM informado. Investigar posição mais específica e exceções.';
 }
 // Códigos especiais de "partes" genéricas merecem revisão por especificidade, não aceite automático.
 if(valid&&/^870899|^870829|^732690/.test(code)&&category&&['junta','retentor','parafuso','porca','filtro','rolamento','correia','mangueira','sensor','bomba'].includes(category.key)){
  status='possível incompatibilidade';
  problem='O NCM informado é genérico para partes/obras; verificar posição específica segundo a função e o material.';
 }
 if(valid&&code.startsWith('870830')&&!/\b(freio|pastilha|lona de freio|tambor de freio)\b/.test(item.technical)){
  status='possível incompatibilidade';problem='NCM de componentes de freio; a descrição não identifica uma peça de freio.';
 }
 if(valid&&code.startsWith('870892')&&!/\b(escape|silenciador|escapamento|gases de escape)\b/.test(item.technical)){
  status='possível incompatibilidade';problem='NCM de silenciosos e tubos de escape; a descrição não identifica sistema de escape.';
 }
 if(valid&&code==='84818021'&&/\b(valvula termostatica)\b/.test(item.technical)&&!/\b(refrigeracao|ar condicionado)\b/.test(item.technical)){
  status='informações insuficientes';problem='Este código descreve válvula de expansão termostática de refrigeração; conferir se a peça é válvula de sistema de arrefecimento de motor.';
 }
 if(valid&&/^4009|^3917/.test(code)&&category?.key==='mangueira'&&item.materials.length===0){
  status='informações insuficientes';problem='É preciso confirmar se a mangueira é de borracha, silicone, plástico ou metal, além do reforço e das conexões.';
 }
 if(valid&&/^401693/.test(code)&&category?.key==='junta'&&!item.materials.includes('borracha')){
  status='informações insuficientes';problem='Juntas dessa posição exigem verificar o material de fabricação (por exemplo, borracha vulcanizada).';
 }
 if(valid&&code.startsWith('401031')&&category?.key==='correia'){
  const m=item.technical.match(/\b\d{1,2}pk(\d{3,4})\b/);
  if(m)evidence.push('Medida comercial PK'+m[1]+' identificada; conferir circunferência real e material da correia.');
 }
 if(category){
  suggestions=category.codes.filter(c=>c!==code).map(c=>({code:c,reason:'Código de família potencialmente relacionada a '+category.label+'; conferir especificação e notas legais.'})).slice(0,3);
 }
 if(!valid)needs.unshift('Confirmar NCM substituto vigente com base na descrição completa.');
 return {
  status,problem,type:item.label,materials:item.materials,evidence,
  missing:needs,originalExists:valid,code,officialText:label,officialContext:context,
  suggestedCodes:suggestions,verification:'Triagem técnica por descrição e família NCM, não validação fiscal definitiva. Confirmar RGI, notas de seção/capítulo, NESH e soluções oficiais.'
 };
}
