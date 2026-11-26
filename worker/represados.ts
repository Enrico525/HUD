// Represados: a lista de nomes fica só no Secret REPRESADOS (JSON com os nomes), nunca no repositório.
// O app manda os proprietários do lote e recebe de volta só os que estão na lista: a lista inteira nunca sai do Worker.
import { z } from "zod";
import { nomeSimples } from "../shared/credenciais";
import type { Ambiente } from "./ambiente";

export const PedidoRepresados = z.strictObject({ nomes: z.array(z.string().max(300)).max(4000) });

export class ErroRepresados extends Error {}

/** Secret ausente ou inválido é erro (e não lista vazia): sem a lista, um represado cairia no pagamento do dia. */
export function listaRepresados(env: Ambiente): Set<string> {
  let dados: unknown;
  try {
    dados = JSON.parse(env.REPRESADOS ?? "");
  } catch {
    throw new ErroRepresados();
  }
  if (!Array.isArray(dados) || !dados.length || !dados.every((n) => typeof n === "string" && nomeSimples(n)))
    throw new ErroRepresados();
  return new Set(dados.map(nomeSimples));
}

export const represadosDoLote = (nomes: string[], env: Ambiente) => {
  const lista = listaRepresados(env);
  return [...new Set(nomes.filter((n) => lista.has(nomeSimples(n))))];
};
