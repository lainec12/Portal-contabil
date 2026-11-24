// Camada de apresentação da aba Ferramentas, isolada das demais abas.
// Busca exclusivamente pelo título e pela descrição dos cartões.
const init = () => {
  const section = document.querySelector('#ferramentas');
  if (!section || document.getElementById('ferramentas-busca')) return;
  const cards = [...section.querySelectorAll('details.ferramenta-card')];
  const bar = document.createElement('div');
  bar.id = 'ferramentas-busca';
  bar.className = 'ferramentas-search-bar';
  const input = document.createElement('input');
  input.type = 'search'; input.id = 'ferramentas-search-input';
  input.setAttribute('aria-label', 'Pesquisar ferramentas');
  input.setAttribute('autocomplete', 'off');
  input.placeholder = 'Pesquisar ferramentas: XML, ICMS, CNAE, PDF...';
  const count = document.createElement('output');
  count.id = 'ferramentas-search-count';
  count.setAttribute('aria-live', 'polite');
  bar.append(input,count);
  const head = section.querySelector('.section-head');
  (head?.parentElement || section).insertBefore(bar,head?.nextSibling || section.firstChild);
  const normalize = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const indexes = cards.map(card => ({
    card, text: normalize((card.querySelector('summary')?.textContent || '') + ' ' + (card.querySelector('p')?.textContent || ''))
  }));
  const filter = () => {
    const query = normalize(input.value.trim());
    let visible = 0;
    for (const {card,text} of indexes) {
      const show = !query || text.includes(query);
      card.hidden = !show;
      if (show) visible++;
    }
    count.textContent = visible + ' de ' + indexes.length + ' ferramentas';
  };
  input.addEventListener('input',filter);
  filter();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
