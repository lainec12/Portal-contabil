const f100Headers = [
  'Mês de Referência','Empresa Declarante','Ind. Operação','Código do Participante','Cód. Produto',
  'Data da Operação','Valor Operação','CST PIS','Valo BC PIS','Alíq. PIS','Valor Pis',
  'CST COFINS','Valor BC COFINS','Alíq. COFINS','Valor COFINS','Natureza BC','Origem Crédito',
  'Cód. Conta Analitica','Cód. Centro Custos','Descrição Operação'
];

const documentId = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/;
const digits = value => String(value ?? '').replace(/\D/g, '');
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const standardColumns = [4,7,9,11,13,15,16,17,18];

export function templateDefaults(rows) {
  const defaults = new Map();
  if (!rows.length) return defaults;
  for (const column of standardColumns) {
    const value = String(rows[0][column] ?? '').trim();
    if (value && rows.every(row => String(row[column] ?? '').trim() === value)) defaults.set(column,value);
  }
  return defaults;
}

function companyFromBook(lines) {
  const header = lines.join('\n').split(/Dt\.\s*(?:Compet[eê]ncia|Emiss[aã]o)/i)[0].split('\n');
  const candidates = new Set();
  for (const [index,line] of header.entries()) {
    const label = line.match(/\bCNPJ\b(?!\s*(?:do\s+)?(?:prestador|tomador))/i);
    if (!label) continue;
    const nearby = [line.slice(label.index+label[0].length),...header.slice(index+1,index+4)].join(' ');
    const id = nearby.match(/\b(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})\b/)?.[0];
    if (id) candidates.add(digits(id));
  }
  if (candidates.size!==1) throw new Error('Não consegui identificar um único CNPJ da empresa declarante no cabeçalho do Livro.');
  return [...candidates][0];
}

export function parseServices(lines) {
  const text = lines.join('\n');
  if (!/servi[cç]os contratados/i.test(text)) throw new Error('Selecione o Livro de ISSQN de Serviços Contratados.');
  const ownId = companyFromBook(lines);
  const pattern = new RegExp('^(\\d{2}/\\d{2}/\\d{4})\\s+(?:NFS-e|Nota Fiscal de S).*?\\s+(\\d+)\\s+(' + documentId.source + ')\\s+(.+?)\\s+R\\$\\s*([\\d.,]+)', 'i');
  const notes = lines.map(line => line.trim().match(pattern)).filter(Boolean).map(([, date, number, id, name, value]) => ({
    date, number, id:digits(id), name, amount:Number(value.replace(/\./g,'').replace(',','.'))
  }));
  const expected = text.match(/Total Registros\s*:\s*(\d+)/i)?.[1];
  const expectedTotal = text.match(/Total Geral\s*:\s*R\$\s*([\d.,]+)/i)?.[1];
  const cents = notes.reduce((sum, note) => sum + Math.round(note.amount * 100), 0);
  if (!notes.length || (expected && notes.length !== Number(expected)) ||
      (expectedTotal && cents !== Number(digits(expectedTotal)))) {
    throw new Error('A leitura não fechou com o relatório. Confira se o PDF tem texto selecionável e se é o modelo de Goiânia.');
  }
  return {notes, ownId, cents};
}

const pisPercent = 1.65;
const cofinsPercent = 7.6;
const defaultRates = [{divisor:100,places:2},{divisor:100,places:2}];
const saved0150Key = 'portal-contabil-saam-0150-layout-v1';
const standard0150Headers = [
  'Mês de Referência','Empresa Declarante','Código do Participante','Nome','Código do País',
  'CNPJ','CPF','IE','Suframa','Endereço','Número do Imóvel','Complemento','Bairro','Código do Munícipio'
];
export function templateRateOptions(rows) {
  return [[8,9,10],[12,13,14]].map(([base,rate,tax])=>{
    const samples=rows.filter(row=>[base,rate,tax].every(i=>String(row[i]??'').trim()&&Number.isFinite(Number(row[i])))&&Number(row[base])*Number(row[rate])!==0);
    const matches=divisor=>samples.filter(row=>Math.abs(Number(row[base])*Number(row[rate])/divisor-Number(row[tax]))<=0.010001).length;
    const places=Math.min(5,Math.max(2,...samples.map(row=>String(row[tax]).split('.')[1]?.length||0)));
    return {divisor:matches(1)>matches(100)?1:100,places};
  });
}

export function contributionValues(amount, pisRate=pisPercent, cofinsRate=cofinsPercent, options=defaultRates) {
  const cents = Math.round(amount * 100);
  const calculate = (rate,{divisor,places}) => {
    const value = Number(String(rate).replace(',','.'));
    const scale=10**places;
    return String(rate).trim() && Number.isFinite(value) ? Math.round(cents*value*scale/(divisor*100))/scale : '';
  };
  return [calculate(pisRate,options[0]),calculate(cofinsRate,options[1])];
}

function setup(root) {
  const get = id => root.querySelector('#'+id);
  const status = get('saam-status');
  const grids = {f100:get('saam-f100-grid'), p150:get('saam-0150-grid')};
  let records = [];
  let selected = [];
  let participants = [];
  let template = {
    name:'Sheet0',headers:standard0150Headers,defaults:new Map([[4,1058],[13,'5208707']]),rows:[]
  };
  // Shared fields from the reference model, without its transactions.
  let f100Defaults = new Map([
    [7,'50'],[9,pisPercent],[11,'50'],[13,cofinsPercent],
    [15,'03'],[16,'0'],[17,'1']
  ]);
  let rateOptions = [{divisor:100,places:5},{divisor:100,places:4}];
  let companyCnpj = '';
  let f100Name = 'Sheet0';
  let f100Columns = f100Headers;
  let workbookLibrary;
  const modelStatus = get('saam-template-0150-status');
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(saved0150Key));
    if (saved) {
      template = {...saved,defaults:new Map(saved.defaults),rows:[]};
      modelStatus.textContent = 'Modelo 0150 salvo neste navegador.';
    }
  } catch {
    // The file can still be loaded when browser storage is unavailable.
  }

  function xlsx() {
    if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
    if (!workbookLibrary) workbookLibrary = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = './vendor/xlsx.full.min.js';
      script.onload = () => resolve(globalThis.XLSX);
      script.onerror = () => { workbookLibrary = null; reject(new Error('Não foi possível abrir o componente de planilhas.')); };
      document.head.append(script);
    });
    return workbookLibrary;
  }

  async function action(callback) {
    try { await callback(); } catch (error) { status.textContent = error.message; }
  }

  const derived = [8,10,12,14];
  function recalculate(row) {
    const value = String(row[6] ?? '');
    const amount = Number(value.includes(',') ? value.replace(/\./g,'').replace(',','.') : value);
    const base = value && Number.isFinite(amount) ? amount : '';
    const [pis,cofins] = base === '' ? ['',''] : contributionValues(base,row[9],row[13],rateOptions);
    [row[8],row[10],row[12],row[14]] = [base,pis,base,cofins];
  }
  function render(grid, headers, rows, selection) {
    const table = document.createElement('table');
    const title = table.createTHead().insertRow();
    for (const label of selection ? ['Incluir', ...headers] : headers) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      title.append(th);
    }
    const body = table.createTBody();
    rows.forEach((row,index) => {
      const tr = body.insertRow();
      if (selection) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selection[index];
        checkbox.setAttribute('aria-label', 'Incluir linha '+(index+1));
        checkbox.onchange = () => { selection[index] = checkbox.checked; };
        tr.insertCell().append(checkbox);
      }
      headers.forEach((header,column) => {
        const input = document.createElement('input');
        input.value = row[column] ?? '';
        input.setAttribute('aria-label', header+', linha '+(index+1));
        input.readOnly = grid === grids.f100 ? column === 1 || derived.includes(column) : /empresa declarante|cnpj.*declarante/.test(normalize(header));
        input.onchange = () => {
          row[column] = input.value.trim();
          if (grid !== grids.f100 || ![6,9,13].includes(column)) return;
          recalculate(row);
          for (const index of [8,10,12,14]) tr.cells[index+1].firstElementChild.value = row[index];
        };
        tr.insertCell().append(input);
      });
    });
    grid.replaceChildren(table);
  }

  function fields0150() {
    return template.headers.map(header => {
      const label = normalize(header);
      if (/empresa declarante|cnpj.*declarante/.test(label)) return 'company';
      if (/mes.*referencia/.test(label)) return 'month';
      if (/cod.*part|^codigo$/.test(label)) return 'code';
      if (/razao|nome/.test(label)) return 'name';
      if (/cnpj.*cpf|cpf.*cnpj/.test(label)) return 'id';
      if (/cnpj/.test(label)) return 'cnpj';
      if (/cpf/.test(label)) return 'cpf';
      return '';
    });
  }

  function renderParticipants() {
    const fields = fields0150();
    const nameIndex=fields.indexOf('name');
    const sourceById=new Map(template.rows.map(row=>{
      const id=fields.map((field,i)=>['id','cnpj','cpf'].includes(field)?digits(row[i]):'').find(Boolean);
      return [id,row];
    }).filter(([id])=>id));
    for (const p of participants) {
      const source=sourceById.get(p.basic[2]);
      p.row ??= fields.map((field,i) => ({
        company:companyCnpj, month:p.month||'', code:p.basic[0], name:source?.[nameIndex]||p.basic[1], id:p.basic[2],
        cnpj:p.basic[2].length===14?p.basic[2]:'', cpf:p.basic[2].length===11?p.basic[2]:''
      })[field] ?? (source?.[i]||template.defaults.get(i)||''));
    }
    render(grids.p150,template.headers,participants.map(p => p.row));
  }

  async function readTemplate(file, kind) {
    const lib = await xlsx();
    const book = lib.read(await file.arrayBuffer(),{type:'array'});
    const name = book.SheetNames[0];
    const sheet = book.Sheets[name];
    const rows = lib.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:false});
    const headers = rows[0]?.map(String) || [];
    const valid = kind === 'f100'
      ? headers.length === f100Headers.length && headers.every((h,i) => normalize(h.trim()) === normalize(f100Headers[i]))
      : headers.some(h => /cnpj|cpf/i.test(h)) && headers.some(h => /nome|raz[aã]o/i.test(h));
    if (!valid) throw new Error('O cabeçalho não corresponde ao modelo '+(kind === 'f100'?'F100':'0150')+' do SAAM.');
    const data=rows.slice(1);
    const defaults=kind==='f100'?templateDefaults(data):new Map(headers.flatMap((header,i)=>{
      if(!/cod.*(pais|munic)/.test(normalize(header)))return [];
      const value=data[0]?.[i];
      return String(value??'').trim()&&data.every(row=>String(row[i])===String(value))?[[i,value]]:[];
    }));
    return {headers,name,defaults,rows:data};
  }

  get('saam-pdf').onchange = event => action(async () => {
    const file = event.target.files[0];
    if (!file) return;
    // Load the workbook library while the user imports and reviews the PDF.
    void xlsx().catch(() => {});
    records = []; selected = []; participants = [];
    companyCnpj = '';
    get('saam-company').textContent = '';
    get("saam-confirm").checked = false;
    grids.f100.replaceChildren(); grids.p150.replaceChildren();
    status.textContent = 'Lendo o PDF no navegador…';
    const lib = await import('./vendor/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
    const pdf = await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
    let parsed;
    try {
      const lines = [];
      for (let i=1;i<=pdf.numPages;i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        lines.push(...groupLines(content.items));
      }
      parsed = parseServices(lines);
    } finally { await pdf.destroy(); }
    const {notes,ownId,cents} = parsed;
    companyCnpj = ownId;
    get('saam-company').textContent = 'Empresa declarante (CNPJ): '+companyCnpj;
    const byId = new Map(notes.map(note => [note.date.slice(3)+'|'+note.id,{basic:[note.id,note.name,note.id],month:note.date.slice(3)}]));
    participants = [...byId.values()];
    records = notes.map(note => {
      const row = [
        note.date.slice(3),ownId,'0',note.id,'',note.date,note.amount,
        '',note.amount,'','','',note.amount,'','','','','','',
        'NFS-e '+note.number+(note.name?' - '+note.name:'')
      ];
      for (const [column,value] of f100Defaults) row[column] = value;
      recalculate(row);
      return row;
    });
    selected = records.map(() => true);
    render(grids.f100,f100Columns,records,selected);
    renderParticipants();
    status.textContent = notes.length+' notas · '+participants.length+' participantes · '+
      (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+
      '. Confira as datas, os códigos e a classificação fiscal antes de exportar.';
  });

  const bulkField = get('saam-bulk-field');
  for (const column of [2,...standardColumns]) {
    bulkField.add(new Option(f100Headers[column],String(column)));
  }
  get('saam-bulk-apply').onclick = () => {
    if (!selected.some(Boolean)) { status.textContent = 'Selecione pelo menos uma nota.'; return; }
    const column = Number(bulkField.value);
    const value = get('saam-bulk-value').value.trim();
    records.forEach((row,index) => { if (selected[index]) { row[column] = value; recalculate(row); } });
    render(grids.f100,f100Columns,records,selected);
    status.textContent = f100Headers[column]+' atualizado nas notas selecionadas.';
  };

  get('saam-template-f100').onchange = event => action(async () => {
    if (!event.target.files[0]) return;
    const model = await readTemplate(event.target.files[0],'f100');
    f100Name = model.name;
    f100Columns = model.headers;
    rateOptions = templateRateOptions(model.rows);
    model.defaults.set(9,pisPercent * rateOptions[0].divisor / 100);
    model.defaults.set(13,cofinsPercent * rateOptions[1].divisor / 100);
    for (const row of records) {
      for (const column of standardColumns) {
        const current = String(row[column] ?? '');
        if (!current || current === String(f100Defaults.get(column) ?? '')) row[column] = model.defaults.get(column) ?? '';
      }
      recalculate(row);
    }
    f100Defaults = model.defaults;
    if (records.length) render(grids.f100,f100Columns,records,selected);
    status.textContent = f100Defaults.size+' campo(s) padrão do modelo F100 identificado(s).';
  });
  get('saam-template-0150').onchange = event => action(async () => {
    if (!event.target.files[0]) return;
    const next = await readTemplate(event.target.files[0],'0150');
    template = next;
    try {
      globalThis.localStorage.setItem(saved0150Key,JSON.stringify({
        name:next.name,headers:next.headers,defaults:[...next.defaults]
      }));
      modelStatus.textContent = 'Modelo 0150 salvo neste navegador.';
    } catch {
      modelStatus.textContent = 'Modelo carregado para esta sessão. O navegador não permitiu salvá-lo.';
    }
    for(const p of participants)delete p.row;
    renderParticipants();
    status.textContent = 'Modelo 0150 carregado. Revise os nomes e complete os dados de cadastro.';
  });
  get('saam-add-0150').onclick = () => {
    participants.push({basic:['','',''],month:records[0]?.[0]||''});
    renderParticipants();
  };

  async function download(headers,rows,name,filename) {
    const lib = await xlsx();
    const book = lib.utils.book_new();
    lib.utils.book_append_sheet(book,lib.utils.aoa_to_sheet([headers,...rows],{dateNF:"dd/mm/yyyy"}),name);
    lib.writeFile(book,filename,{bookType:'biff8'});
  }
  function bindDownload(id, exportWorkbook) {
    const button = get(id);
    const message = get(id+'-status');
    button.onclick = async () => {
      button.disabled = true;
      message.textContent = 'Preparando a planilha…';
      try {
        await exportWorkbook();
        message.textContent = 'Planilha gerada. Confira os downloads do navegador.';
      } catch (error) {
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }

  bindDownload('saam-download-f100', async () => {
    const rows = records.filter((row,index) => selected[index]);
    if (!rows.length) throw new Error('Selecione pelo menos uma nota.');
    if (!get('saam-confirm').checked || !/^\d{14}$/.test(companyCnpj) || rows.some(row => [1,2,3,6,7,9,11,13].some(i => String(row[i]??'').trim()===''))) {
      throw new Error('Confira a empresa declarante, o enquadramento no F100 e os indicadores, participantes, valores, CSTs e alíquotas das linhas selecionadas.');
    }
    const outputRows = rows.map(row => row.map((value,index) => {
      if (index === 5) {
        const date = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!date) throw new Error('Use DD/MM/AAAA nas datas da operação.');
        const [,day,month,year] = date;
        const utc = new Date(Date.UTC(+year,+month-1,+day));
        if (utc.getUTCDate() !== +day || utc.getUTCMonth()+1 !== +month) {
          throw new Error('Há uma data de operação inválida.');
        }
        return utc;
      }
      if ([6,8,9,10,12,13,14].includes(index) && value !== '') {
        const text = String(value);
        const number = Number(text.includes(',') ? text.replace(/\./g,'').replace(',','.') : text);
        if (!Number.isFinite(number)) throw new Error('Confira os valores e as alíquotas do F100.');
        return number;
      }
      return value;
    }));
    await download(f100Columns,outputRows,f100Name,'registro_piscofins_f100.xls');
  });
  bindDownload('saam-download-0150', async () => {
    if (!participants.length) throw new Error('Importe o PDF ou adicione um participante.');
    const fields = fields0150();
    if (fields.includes('company')&&!/^\d{14}$/.test(companyCnpj)) throw new Error('Importe o REST para identificar a empresa declarante.');
    const nameIndex = fields.indexOf('name');
    const incomplete = participants.flatMap((p,index) =>
      !String(p.row[nameIndex] || '').trim() ? [index+1] : []);
    if (incomplete.length) {
      throw new Error('Complete o nome ou a razão social nas linhas '+incomplete.join(', ')+'.');
    }
    await download(template.headers,participants.map(p => p.row),template.name,'registro_piscofins_0150.xls');
  });

  for (const button of root.querySelectorAll('[data-saam-panel]')) button.onclick = () => {
    for (const tab of root.querySelectorAll('[data-saam-panel]')) {
      const active = tab === button;
      tab.setAttribute('aria-pressed',String(active));
      get(tab.dataset.saamPanel).hidden = !active;
    }
  };
}

export function groupLines(items) {
  const lines = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const [x,y] = item.transform.slice(4);
    let line = lines.find(candidate => Math.abs(candidate.y-y)<2);
    if (!line) lines.push(line = {y,items:[]});
    line.items.push({x,text:item.str.trim()});
  }
  return lines.sort((a,b) => b.y-a.y).map(line =>
    line.items.sort((a,b) => a.x-b.x).map(item => item.text).join(' '));
}

const section = typeof document === 'undefined' ? null : document.querySelector('#saam-f100');
if (section) setup(section);
