# Hospedar na Vercel (alternativa à Cloudflare)

O mesmo app roda na Vercel sem mudar o código do Worker:

- `vercel.json`: build (`vite build` → `dist/client`), headers de segurança (iguais a `public/_headers`) e
  rewrites de `/api/*` e `/auth/*` para a Edge Function, com o resto caindo no `index.html`.
- `api/hud.ts`: Edge Function que chama `worker/index.ts` através de `vercel/adaptador.ts`.
- `vercel/adaptador.ts`: troca o que é da Cloudflare: variáveis vêm de `process.env`, o IP vem do `x-real-ip`
  da Vercel e o rate limit é em memória (por instância; mais fraco que o da Cloudflare).

## Passos

1. Importe o repositório `Enrico525/HUD` em vercel.com → Add New → Project (o `vercel.json` já configura o build).
2. Não precisa de variáveis: o site abre sem login. (`SESSION_SECRET` e `USUARIOS` só seriam usados pela rota
   `/api/analisar`, que o app não usa.)
3. Faça o deploy (o próprio push no `main` publica, ou `npx vercel --prod`).
4. Confira em janela anônima: `/` abre o HUD direto e `/api/eu` responde `{"erro":"nao_autenticado"}`.

