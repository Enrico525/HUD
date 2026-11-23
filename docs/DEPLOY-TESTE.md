# Publicar na Cloudflare

App publicado em `https://hud.specialimoveis.workers.dev` (Worker `hud`, subdomínio da conta `specialimoveis`).
O site abre **sem login**. Usar apenas documentos **fictícios ou anonimizados** nos testes.

Comandos no terminal, na pasta do projeto (já logado com `npx wrangler login`).

## Publicar o app

```bash
npm run deploy
```

Só publica se a checagem de tipos e os testes passarem.

## Verificar (janela anônima)

- [ ] `/` abre o HUD direto, com o menu lateral
- [ ] Conferência de Áreas mostra “Base carregada” e encontra um endereço conhecido
- [ ] Selecionar dois PDFs fictícios em Repasses juntados → páginas e situação exibidas
- [ ] `/api/eu` → `{"erro":"nao_autenticado"}` (a API continua fechada; o app não a usa)
