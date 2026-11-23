# Hospedar na Vercel (alternativa à Cloudflare)

O mesmo app roda na Vercel sem mudar o código do Worker:

- `vercel.json`: build (`vite build` → `dist/client`), headers de segurança (iguais a `public/_headers`) e
  rewrites de `/api/*` e `/auth/*` para a Edge Function, com o resto caindo no `index.html`.
- `api/hud.ts`: Edge Function que chama `worker/index.ts` através de `vercel/adaptador.ts`.
- `vercel/adaptador.ts`: troca o que é da Cloudflare: variáveis vêm de `process.env`, o IP vem do `x-real-ip`
  da Vercel e o rate limit é em memória (por instância; mais fraco que o da Cloudflare).

## Passos

1. Importe o repositório `Enrico525/HUD` em vercel.com → Add New → Project (o `vercel.json` já configura o build).
2. Em Settings → Environment Variables (Production), cadastre:
   - `SESSION_SECRET`: texto aleatório com 32+ caracteres (use um diferente do da Cloudflare).
   - `USUARIOS`: o JSON de `usuarios.local.json` (nomes e hashes, gerado por `npm run usuarios -- adicionar`).
     Copie o conteúdo do arquivo para a variável; `npm run usuarios -- publicar` só envia para a Cloudflare.
   - `AMBIENTE`: `producao` (é o padrão se ficar vazio).
3. Faça o deploy (o próprio push no `main` publica, ou `npx vercel --prod`).
4. Confira em janela anônima: `/` mostra o login e `/api/eu` responde `{"erro":"nao_autenticado"}`.

Trocar usuários na Vercel exige editar a variável `USUARIOS` e fazer um redeploy.
