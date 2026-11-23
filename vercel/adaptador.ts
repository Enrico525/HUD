// Roda o mesmo Worker (worker/index.ts) numa Edge Function da Vercel.
// O que é da Cloudflare e precisa de troca: o rate limit (binding LIMITADOR), o IP (CF-Connecting-IP)
// e as variáveis (process.env em vez de env). O resto do Worker já usa só APIs Web padrão.
import worker from "../worker/index";
import type { Ambiente } from "../worker/ambiente";

/** Limite simples em memória: `limite` chamadas por chave a cada `periodo` ms. */
// shortcut: memória de cada instância da Vercel, zera em cold start e não é compartilhado entre regiões;
// trocar por Vercel KV/Upstash se precisar de limite exato.
export function criarLimitador(limite = 10, periodo = 60_000, agora = () => Date.now()) {
  const janelas = new Map<string, { inicio: number; usadas: number }>();
  return {
    async limit({ key }: { key: string }) {
      const t = agora();
      let j = janelas.get(key);
      if (!j || t - j.inicio >= periodo) {
        if (janelas.size > 10_000) janelas.clear(); // não deixa a memória crescer sem fim
        j = { inicio: t, usadas: 0 };
        janelas.set(key, j);
      }
      j.usadas++;
      return { success: j.usadas <= limite };
    },
  };
}

/**
 * O vercel.json reescreve /api/* e /auth/* para /api/hud?rota=<caminho original>.
 * Aqui a requisição volta ao caminho original e ganha o IP real no header que o Worker lê.
 */
export function requisicaoOriginal(request: Request): Request {
  const url = new URL(request.url);
  const rota = url.searchParams.get("rota");
  url.searchParams.delete("rota");
  if (rota?.startsWith("/")) url.pathname = rota;
  const headers = new Headers(request.headers);
  // Sobrescreve sempre: o valor vindo do navegador não é confiável; x-real-ip é preenchido pela Vercel.
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  headers.set("CF-Connecting-IP", ip || "desconhecido");
  return new Request(url, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // @ts-expect-error duplex é exigido pelo runtime para corpo em stream, mas ainda não está nos tipos do DOM
    duplex: "half",
  });
}

const variavel = (nome: string) => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[nome] ?? "";

export function ambienteVercel(limitador = criarLimitador()): Ambiente {
  return {
    AMBIENTE: variavel("AMBIENTE") || "producao",
    USUARIOS: variavel("USUARIOS"),
    SESSION_SECRET: variavel("SESSION_SECRET"),
    OPENAI_MODEL: variavel("OPENAI_MODEL"),
    OPENAI_API_KEY: variavel("OPENAI_API_KEY"),
    LIMITADOR: limitador as unknown as RateLimit,
  };
}

const ambiente = ambienteVercel();
export const tratar = (request: Request) => worker.fetch(requisicaoOriginal(request), ambiente);
