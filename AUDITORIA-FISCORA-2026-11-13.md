# Fiscora — Revisão técnica e fiscal (13/11/2026)

**Escopo:** revisão pontual dos arquivos e referências do site; não constitui auditoria tributária integral nem certificação de todas as calculadoras.

## Alterações realizadas
- Corrigido reconhecimento de operações tributárias no resumo mensal de ISSQN (não podem ser agregadas como duplicata de operações exigíveis).
- Leitura das cinco colunas do quadro-resumo: valor dos documentos, base sem retenção, ISS sem retenção, base com retenção, ISS retido.
- Totalização de serviços válidos separada de documentos cancelados/anulados.
- Quando o PDF não estiver integralmente conciliado, impedir exportação CSV validada; permitir apenas PDF preliminar com aviso visível.
- Disponibilizada no site a seção de fontes oficiais e datas de versões relevantes.
- Conferidos caminhos principais dos arquivos JS e imports: portal.js, saam.mjs, sheet-compare.mjs, cnpj-cnae.mjs, prestadores.mjs, municipios.mjs, saam-xml.mjs e biblioteca XLSX.

## Fontes oficiais consultadas
- [Portal Nacional NF-e — Informes técnicos](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=hXzemuyNHW4%3D): CFOP IT 2023.002 v2.10 (04/09/2026), NCM IT 2024.001 v2.40 (03/09/2026), classificação IBS/CBS IT 2025.002 v1.71 (30/10/2026).
- [Receita Federal — principais marcos da reforma tributária](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/legislacao/principais-marcos-regulatorios): EC 132/2023, LC 214/2025, LC 227/2026 e regulamentação.
- [Portal do Simples Nacional](https://www8.receita.fazenda.gov.br/SimplesNacional/).

## Testes realizados
- Presença de arquivos e dependências JS no repositório: **conferida**.
- Sintaxe do script de conferência de ISSQN: **verificada** por compilação sem execução do navegador.
- Caso de teste sintético de quadro-resumo com categorias Exigível e Operação tributária: **passou**, ambas são somadas.
- Conferência visual e end-to-end com PDFs de diferentes municípios: **não concluída**.
- Conciliar cada nota individual ao quadro-resumo, alíquota e valores de ISS retidos: **pendente**.
- Testes funcionais de PGDAS-D, DIFAL, cálculos estaduais, EFD-Reinf e demais módulos: **pendentes**.
- Conferir todas as linhas das tabelas locais CFOP/NCM/benefícios/anexos contra fontes oficiais: **pendente**.
- Confirmação externa da URL publicada do GitHub Pages e do status do deploy: **não obtida** pelos acessos disponíveis.

## Regras de uso
O usuário deve validar datas, competência, natureza da operação, retenção, código do serviço, alíquota municipal e fundamento de eventuais 0%. Diferenças calculadas não devem ser automaticamente tratadas como imposto devido. O resultado não validado deve ser marcado como preliminar e não deve ser usado para transmitir declarações sem conferência.

> Documentos de clientes e dados extraídos **não** são adicionados ao repositório. Para reproduzir falhas, use amostras anonimizadas.
