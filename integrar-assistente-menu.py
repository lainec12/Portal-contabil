#!/usr/bin/env python3
"""Adiciona link ao menu do Portal durante o deploy, sem alterar o index original."""
from pathlib import Path

index = Path("index.html")
assistant = Path("assistente-operacoes-fiscais.html")
if not index.is_file() or index.stat().st_size < 100_000:
    raise SystemExit("BLOQUEADO: index.html original ausente ou inesperadamente pequeno.")
if not assistant.is_file() or assistant.stat().st_size < 2_000:
    raise SystemExit("BLOQUEADO: arquivo do assistente ausente.")
html = index.read_text(encoding="utf-8")
anchor = '<nav class="links" id="mainNav" aria-label="Abas principais"><a href="#inicio">Início</a>'
new = anchor + '<a href="./assistente-operacoes-fiscais.html">Assistente de Operações Fiscais</a>'
if new in html:
    print("Link ja integrado.")
elif html.count(anchor) != 1:
    raise SystemExit("BLOQUEADO: estrutura do menu mudou; nao publicar alteracao.")
else:
    html = html.replace(anchor, new, 1)
    index.write_text(html, encoding="utf-8")
    print("Adicionado link isolado ao menu.")
assert 'id="conferencia-notas"' in html
assert 'id="historico-12m"' in html
assert 'id="cnpj-cnae"' in html
assert 'src="./portal.js"' in html
print("Conferencias de funcionalidades essenciais aprovadas.")
