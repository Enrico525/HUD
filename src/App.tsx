import { useEffect, useMemo, useRef, useState } from "react";
import { lerPdf, ErroLeitura } from "./pdf/extrair";
import { juntarPdfs } from "./pdf/juntar";
import { extratosNaoLidos, lerRecibos, lerRepasses, type Recibo, type Repasse } from "./nido/ler";
import { conferirSem, idRepasse, jaPagosAntes, separarRepresados } from "./nido/conferir";
import { buscarRepresados } from "./api";
import { nomeSimples } from "../shared/credenciais";
import { AvisoAtualizacao } from "./components/AvisoAtualizacao";
import { SeletorPdf, type ArquivoLido } from "./components/SeletorPdf";
import { Resultado } from "./components/Resultado";
import { Logo } from "./components/Logo";
import { ConferenciaAreas } from "./components/ConferenciaAreas";

type Lado = "recibos" | "repasses" | "anteriores";
/** geral: todos os extratos de uma vez. um: um extrato por vez, mantendo os recibos carregados. */
export type Modo = "geral" | "um";
type Pagina = Modo | "juntar" | "represados" | "areas";
// Menu lateral do HUD: um grupo por site original.
const GRUPOS: { nome: string; paginas: { id: Pagina; nome: string; descricao: string }[] }[] = [
  {
    nome: "Financeiro",
    paginas: [
      { id: "juntar", nome: "Juntar PDF", descricao: "Vários extratos de repasse em um PDF só" },
      { id: "um", nome: "Repasses únicos", descricao: "Recibos ficam carregados; confira um ou vários extratos por vez" },
      { id: "geral", nome: "Repasses juntados", descricao: "Todos os recibos × todos os extratos (ou o PDF juntado)" },
      { id: "represados", nome: "Represados", descricao: "Repasses segurados a pedido do proprietário (em breve)" },
    ],
  },
  {
    nome: "Áreas",
    paginas: [
      { id: "areas", nome: "Conferência de Áreas", descricao: "SQL, área, zoneamento e IPTU de terrenos em São Paulo" },
    ],
  },
];
type Arquivos = { recibos: ArquivoLido<Recibo>[]; repasses: ArquivoLido<Repasse>[]; anteriores: ArquivoLido<Repasse>[] };
const VAZIO: Arquivos = { recibos: [], repasses: [], anteriores: [] };

const LADOS = {
  recibos: { rotulo: "Recibos do Locatário", plural: "recibos", titulo: "Recibo do Locatário", ler: lerRecibos },
  repasses: { rotulo: "Extratos de Repasse", plural: "extratos", titulo: "Extrato de Repasse", ler: lerRepasses },
  // Extratos de lotes já pagos: só para achar repasse que voltou num lote novo (não entram na conferência).
  anteriores: { rotulo: "Lotes anteriores já pagos (opcional)", plural: "extratos", titulo: "Extrato de Repasse", ler: lerRepasses },
} as const;

export function App() {
  const [arquivos, setArquivos] = useState<Arquivos>(VAZIO);
  // Dados lidos da conferência em tela (só em memória): permitem remover ou adicionar extratos e analisar de novo.
  const [base, setBase] = useState<{ recibos: Recibo[]; repasses: Repasse[]; anteriores: Repasse[] } | null>(null);
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  // Já pagos em lote anterior saem da soma sozinhos; `liberados` são os que a pessoa confirmou que ainda deve pagar.
  const [liberados, setLiberados] = useState<Set<string>>(new Set());
  // Represados do lote (nomes em `nomeSimples`, vindos do Worker): saem da conferência e da soma do dia.
  const [represados, setRepresados] = useState<Set<string>>(new Set());
  const dia = useMemo(() => base && separarRepresados(base.recibos, base.repasses, represados), [base, represados]);
  const jaPagos = useMemo(() => (base && dia ? jaPagosAntes(dia.repasses, base.anteriores) : []), [base, dia]);
  const casos = useMemo(
    () => dia && conferirSem(dia.recibos, dia.repasses, new Set([...removidos, ...jaPagos.map((j) => j.id).filter((id) => !liberados.has(id))])),
    [dia, removidos, jaPagos, liberados],
  );
  const [pagina, setPagina] = useState<Pagina>("geral");
  const modo: Modo = pagina === "um" ? "um" : "geral";
  const proximoId = useRef(0);

  const limparTudo = () => {
    setArquivos(VAZIO);
    setBase(null);
    setRemovidos(new Set());
    setLiberados(new Set());
    setRepresados(new Set());
  };

  /** Pergunta ao Worker quais proprietários são represados. Se falhar, a conferência não começa: um represado não pode cair no pagamento do dia. */
  const separar = async (repasses: Repasse[]) => {
    try {
      const { represados } = await buscarRepresados([...new Set(repasses.map((r) => r.proprietario))]);
      return represados.map(nomeSimples);
    } catch (e) {
      alert(`Não foi possível separar os represados, por isso a conferência não começou. ${(e as Error).message}`);
      return null;
    }
  };

  // Limpeza de melhor esforço ao sair da página.
  useEffect(() => {
    window.addEventListener("pagehide", limparTudo);
    return () => window.removeEventListener("pagehide", limparTudo);
  }, []);

  // Atualiza um arquivo pelo id; se ele já foi removido, a leitura que terminou depois é descartada.
  const atualizar = (lado: Lado, id: number, novo: ArquivoLido<Recibo> | ArquivoLido<Repasse>) =>
    setArquivos((s) => ({ ...s, [lado]: s[lado].map((a) => (a.id === id ? novo : a)) }));

  const adicionar = async (lado: Lado, lista: File[]) => {
    const novos = lista.map((arquivo) => ({ id: ++proximoId.current, nome: arquivo.name, arquivo }));
    setArquivos((s) => ({
      ...s,
      [lado]: [...s[lado], ...novos.map(({ id, nome }) => ({ id, nome, estado: "lendo" as const }))],
    }));
    for (const { id, nome, arquivo } of novos) {
      try {
        const doc = await lerPdf(arquivo);
        if (doc.possivelmenteDigitalizado)
          throw new ErroLeitura(
            "Este PDF não tem texto (provavelmente foi gerado por “Imprimir”). Exporte o relatório direto do NIDO.",
          );
        const registros = LADOS[lado]
          .ler(doc.paginas, nome)
          .map((r) => ({ ...r, origem: doc.paginas[r.pagina - 1]?.origem }));
        if (!registros.length)
          throw new ErroLeitura(`Nenhum “${LADOS[lado].titulo}” encontrado. Confira se este é o relatório certo do NIDO.`);
        // Dupla checagem: um extrato que fica sem ler some da soma em silêncio, então o arquivo inteiro é recusado.
        const faltam = lado === "recibos" ? "" : extratosNaoLidos(doc.paginas, registros as Repasse[]);
        if (faltam)
          throw new ErroLeitura(
            `A contagem do PDF não bateu com a leitura: ${faltam}. A soma ficaria errada, por isso o arquivo foi recusado. Exporte de novo do NIDO ou mande cada extrato em um PDF.`,
          );
        const ok = { id, nome, estado: "ok", paginas: doc.paginas.length, registros, arquivo } as ArquivoLido<Recibo>;
        atualizar(lado, id, ok);
      } catch (e) {
        const mensagem = e instanceof ErroLeitura ? e.message : "Não foi possível ler o PDF.";
        atualizar(lado, id, { id, nome, estado: "erro", mensagem });
      }
    }
  };

  const remover = (lado: Lado, id: number) =>
    setArquivos((s) => ({ ...s, [lado]: s[lado].filter((a) => a.id !== id) }));

  // O PDF juntado é só baixado para o computador; o app não guarda nada.
  const juntarRepasses = async () => {
    try {
      const bytes = await juntarPdfs(arquivos.repasses.flatMap((a) => (a.estado === "ok" ? [a.arquivo] : [])));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      link.download = `Extratos de Repasse - ${new Date().toLocaleDateString("pt-BR").replaceAll("/", "-")}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) {
      alert(e instanceof ErroLeitura ? e.message : "Não foi possível juntar os PDFs.");
    }
  };

  const lidos = <T,>(lista: ArquivoLido<T>[]) => lista.flatMap((a) => (a.estado === "ok" ? a.registros : []));
  const todos = [...arquivos.recibos, ...arquivos.repasses, ...arquivos.anteriores];
  const prontos =
    !todos.some((a) => a.estado !== "ok") && lidos(arquivos.recibos).length > 0 && lidos(arquivos.repasses).length > 0;

  const iniciar = async () => {
    const nomes = await separar(lidos(arquivos.repasses));
    if (!nomes) return;
    setRepresados(new Set(nomes));
    setBase({ recibos: lidos(arquivos.recibos), repasses: lidos(arquivos.repasses), anteriores: lidos(arquivos.anteriores) });
    setRemovidos(new Set());
    setLiberados(new Set());
    // A lista de arquivos é esvaziada; os dados lidos ficam em `base` enquanto o resultado está na tela.
    // No modo "um", os recibos ficam carregados para o próximo extrato.
    setArquivos(modo === "um" ? { ...arquivos, repasses: [] } : VAZIO);
  };

  // Extratos adicionados com o resultado na tela: o extrato com o mesmo número e proprietário é substituído
  // (versão corrigida); os demais continuam.
  const analisarDeNovo = async () => {
    const novos = lidos(arquivos.repasses);
    const nomes = await separar(novos);
    if (!nomes) return;
    setRepresados((s) => new Set([...s, ...nomes]));
    const ids = new Set(novos.map(idRepasse));
    setBase((b) => b && { ...b, repasses: [...b.repasses.filter((r) => !ids.has(idRepasse(r))), ...novos] });
    setRemovidos((s) => new Set([...s].filter((id) => !ids.has(id))));
    setArquivos((s) => ({ ...s, repasses: [] }));
  };
  const extrasProntos = arquivos.repasses.length > 0 && arquivos.repasses.every((a) => a.estado === "ok");

  const pedirLimpeza = () => {
    if (casos && !confirm("Começar uma nova conferência? O resultado atual não poderá ser recuperado.")) return;
    limparTudo();
  };

  const trocarPagina = (novo: Pagina) => {
    if (novo === pagina) return;
    if ((casos || todos.length) && !confirm("Trocar de página apaga os arquivos e o resultado atuais. Continuar?"))
      return;
    limparTudo();
    setPagina(novo);
  };

  return (
    <>
      <header className="topo">
        <Logo />
        <span className="topo__titulo">HUD</span>
      </header>
      <AvisoAtualizacao />

      <div className="layout">
        <nav className="lateral" aria-label="Páginas">
          {GRUPOS.map((g) => (
            <div key={g.nome} className="lateral__grupo">
              <p className="lateral__titulo">{g.nome}</p>
              {g.paginas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="modo"
                  aria-current={pagina === p.id ? "page" : undefined}
                  onClick={() => trocarPagina(p.id)}
                >
                  <strong>{p.nome}</strong>
                  <span>{p.descricao}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="conteudo">
          {pagina === "areas" ? (
            <ConferenciaAreas />
          ) : pagina === "represados" ? (
            // shortcut: só o esqueleto; anexar e conferir os PDFs dos represados fica para quando o negócio definir.
            <>
              <h1>Represados</h1>
              <p className="subtitulo">
                Repasses que os proprietários pedem para segurar. Hoje eles já saem sozinhos da soma em “Repasses únicos”
                e “Repasses juntados” e aparecem no relatório em “Represados desta leva (fora da soma)”.
              </p>
              <p className="caso__meta">Em breve: anexar aqui os PDFs dos represados para conferir um proprietário por vez.</p>
            </>
          ) : pagina === "juntar" ? (
            <>
              <h1>Juntar PDF</h1>
              <p className="subtitulo">
                Junte vários Extratos de Repasse em um PDF só e salve no seu computador. Depois, use esse PDF em
                “Repasses juntados”. Nada é enviado nem salvo pelo app.
              </p>
              <div className="seletores">
                <SeletorPdf
                  rotulo={LADOS.repasses.rotulo}
                  plural={LADOS.repasses.plural}
                  arquivos={arquivos.repasses}
                  aoSelecionar={(f) => adicionar("repasses", f)}
                  aoRemover={(id) => remover("repasses", id)}
                />
              </div>
              <div className="acoes">
                <button
                  type="button"
                  className="botao"
                  disabled={arquivos.repasses.length < 2 || arquivos.repasses.some((a) => a.estado !== "ok")}
                  onClick={juntarRepasses}
                >
                  Juntar e salvar PDF
                </button>
              </div>
            </>
          ) : (
            <>
              <h1>{modo === "um" ? "Repasses únicos" : "Repasses juntados"}</h1>
              <p className="subtitulo">
                Recibos do Locatário × Extratos de Repasse exportados do NIDO. Os PDFs são lidos e conferidos no seu
                computador: nada é enviado nem salvo.
              </p>

              {modo === "um" && (
                <p className="alerta">
                  Neste modo, repasse em dobro só é detectado entre os extratos da mesma conferência: o app não
                  guarda as conferências anteriores.
                </p>
              )}

              {!casos && (
                <div className="seletores">
                  {(["recibos", "repasses", "anteriores"] as const).map((lado) => (
                    <SeletorPdf
                      key={lado}
                      rotulo={LADOS[lado].rotulo}
                      plural={LADOS[lado].plural}
                      arquivos={arquivos[lado]}
                      aoSelecionar={(f) => adicionar(lado, f)}
                      aoRemover={(id) => remover(lado, id)}
                    />
                  ))}
                </div>
              )}

              <div className="acoes">
                {!casos ? (
                  <button type="button" className="botao" disabled={!prontos} onClick={iniciar}>
                    Conferir
                  </button>
                ) : modo === "um" ? (
                  <>
                    <button type="button" className="botao" onClick={() => setBase(null)}>
                      Conferir outros extratos
                    </button>
                    <button type="button" className="botao botao--secundario" onClick={pedirLimpeza}>
                      Trocar os recibos
                    </button>
                  </>
                ) : (
                  <button type="button" className="botao botao--secundario" onClick={pedirLimpeza}>
                    Nova conferência
                  </button>
                )}
              </div>

              {casos && (
                <section className="adicionar nao-imprimir" aria-label="Adicionar extratos">
                  <SeletorPdf
                    rotulo="Adicionar ou trocar extratos"
                    plural={LADOS.repasses.plural}
                    arquivos={arquivos.repasses}
                    aoSelecionar={(f) => adicionar("repasses", f)}
                    aoRemover={(id) => remover("repasses", id)}
                  />
                  <p className="caso__meta">
                    Os extratos já analisados continuam. Um extrato com o mesmo número e proprietário substitui o
                    anterior (use para colocar a versão corrigida).
                  </p>
                  <button type="button" className="botao" disabled={!extrasProntos} onClick={analisarDeNovo}>
                    Analisar de novo
                  </button>
                </section>
              )}

              {casos && (
                <Resultado
                  casos={casos}
                  modo={modo}
                  removidos={removidos.size}
                  jaPagos={jaPagos.map((j) => ({ ...j, liberado: liberados.has(j.id) }))}
                  aoLiberar={(id, sim) => setLiberados((s) => { const n = new Set(s); if (sim) n.add(id); else n.delete(id); return n; })}
                  aoRemoverRepasse={(id) => setRemovidos((s) => new Set(s).add(id))}
                  aoRestaurar={() => setRemovidos(new Set())}
                  represados={dia?.separados ?? []}
                />
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
