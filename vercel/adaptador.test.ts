import { describe, expect, it } from "vitest";
import { criarLimitador, requisicaoOriginal } from "./adaptador";

describe("adaptador Vercel", () => {
  it("volta a requisição para o caminho original e sem o parâmetro rota", () => {
    const r = requisicaoOriginal(new Request("https://hud.vercel.app/api/hud?rota=/auth/entrar", { method: "POST", body: "{}" }));
    expect(new URL(r.url).pathname).toBe("/auth/entrar");
    expect(new URL(r.url).search).toBe("");
    expect(r.method).toBe("POST");
  });

  it("ignora rota que não começa com /", () => {
    const r = requisicaoOriginal(new Request("https://hud.vercel.app/api/hud?rota=https://outro.site/x"));
    expect(new URL(r.url).href).toBe("https://hud.vercel.app/api/hud");
  });

  it("troca o CF-Connecting-IP enviado pelo navegador pelo IP da Vercel", () => {
    const r = requisicaoOriginal(
      new Request("https://hud.vercel.app/api/hud?rota=/api/eu", { headers: { "CF-Connecting-IP": "1.1.1.1", "x-real-ip": "9.9.9.9" } }),
    );
    expect(r.headers.get("CF-Connecting-IP")).toBe("9.9.9.9");
  });

  it("limita por chave e libera depois do período", async () => {
    let t = 0;
    const l = criarLimitador(2, 1000, () => t);
    expect((await l.limit({ key: "a" })).success).toBe(true);
    expect((await l.limit({ key: "a" })).success).toBe(true);
    expect((await l.limit({ key: "a" })).success).toBe(false);
    expect((await l.limit({ key: "b" })).success).toBe(true);
    t = 1000;
    expect((await l.limit({ key: "a" })).success).toBe(true);
  });
});

describe("Worker pela Vercel", () => {
  it("/api/eu sem sessão responde 401 nao_autenticado", async () => {
    const { tratar } = await import("./adaptador");
    const r = await tratar(new Request("https://hud.vercel.app/api/hud?rota=/api/eu"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: "nao_autenticado" });
  });
});
