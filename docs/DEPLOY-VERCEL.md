# Vercel (esqueleto, para ligar no futuro)

Por enquanto o HUD roda só na Cloudflare (`npm run deploy`). Para a Vercel existe apenas o esqueleto:

- `vercel.json`: build (`vite build` → `dist/client`), cabeçalhos de segurança iguais aos de `public/_headers`
  e fallback do site (toda rota cai no `index.html`).

Isso já basta para o site funcionar na Vercel, porque ele não tem login e todas as páginas rodam no navegador.

## Quando for ligar

1. vercel.com → Add New → Project → importe `Enrico525/HUD`. Não precisa de variáveis de ambiente.
2. Deploy. Confira se `/` abre o HUD e se a Conferência de Áreas carrega a base (`/areas/terrenos.json`).

Fica de fora: as rotas `/api/*` e `/auth/*` do Worker (só usadas pela rota de IA `/api/analisar`, sem uso).
Se um dia precisar delas na Vercel, o commit `b74f546` tem um adaptador pronto (`api/hud.ts` +
`vercel/adaptador.ts`) que roda o mesmo Worker numa Edge Function.
