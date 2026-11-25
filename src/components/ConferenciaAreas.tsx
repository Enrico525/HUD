import { useEffect, useState, type ChangeEvent } from "react";
import { lerPdf, ErroLeitura } from "../pdf/extrair";
import { buildIndex, extractAddresses, lookup, splitLine, type Base, type Indice, type Terreno } from "../areas/match";

// Link oficial onde a pessoa confere o IPTU exato pelo SQL.
const CONSULTA = "https://www.prefeitura.sp.gov.br/cidade/secretarias/fazenda/servicos/iptu/";

type Linha = { line: string; nome: string; q: string; status: string; h?: Terreno };

// A base é pública (cadastro da Prefeitura) e grande: carregada uma vez por aba, só em memória.
let base: Promise<{ indice: Indice; ano: string; total: number; areaMin: number }> | null = null;
const carregarBase = () =>
  (base ??= fetch("/areas/terrenos.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Base>;
    })
    .then((d) => ({ indice: buildIndex(d), ano: d.ano ?? "?", total: d.rows.length, areaMin: d.areaMin ?? 0 }))
    .catch((e) => {
      base = null; // deixa tentar de novo ao voltar para a página
      throw e;
    }));

const brl = (v?: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const m2 = (v?: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

function linhaPlanilha(r: Linha) {
  const h = r.h;
  return {
    "Nome": r.nome || "", "Endereço informado": r.q, "Situação": r.status,
    "SQL": h?.sql || "", "Endereço no cadastro": h?.end || "", "Bairro": h?.bairro || "", "CEP": h?.cep || "",
    "Área do terreno (m²)": h?.area ?? null, "Zoneamento": h?.zona || "",
    "Valor m² terreno (R$)": h?.vm2 ?? null,
    // shortcut: área × valor do m² × 1,5%, sem fatores de testada/profundidade nem descontos; o exato só pelo link "conferir".
    "IPTU estimado terreno (R$/ano)": h?.area != null && h?.vm2 != null ? Math.round(h.area * h.vm2 * 1.5) / 100 : null,
    "Unidades no lote": h?.n || "",
  };
}

const seloSituacao = (s: string) =>
  s.startsWith("Encontrado") ? "selo selo--ok" : s.startsWith("Não") ? "selo selo--divergencia" : "selo selo--aviso";

export function ConferenciaAreas() {
  const [indice, setIndice] = useState<Indice | null>(null);
  const [ano, setAno] = useState("?");
  const [status, setStatus] = useState("Carregando base de dados…");
  const [erro, setErro] = useState<string | null>(null);
  const [enderecos, setEnderecos] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);

  useEffect(() => {
    let ativo = true;
    carregarBase().then(
      (b) => {
        if (!ativo) return;
        setIndice(b.indice);
        setAno(b.ano);
        setStatus(`Base carregada: ${b.total.toLocaleString("pt-BR")} terrenos (≥ ${b.areaMin} m²).`);
      },
      (e: Error) => ativo && setErro(`Falha ao carregar a base: ${e.message}`),
    );
    return () => {
      ativo = false;
    };
  }, []);

  const lerArquivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro(null);
    setStatus("Lendo arquivo…");
    try {
      let texto: string;
      if (/\.pdf$/i.test(f.name)) texto = (await lerPdf(f)).paginas.map((p) => p.texto).join("\n");
      else if (/\.docx$/i.test(f.name)) {
        const mammoth = await import("mammoth");
        texto = (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
      } else texto = await f.text();
      const achados = extractAddresses(texto);
      setEnderecos(achados.join("\n"));
      setStatus(`${achados.length} endereço(s) encontrados no arquivo. Confira a lista e clique em Buscar.`);
    } catch (err) {
      setErro(`Não consegui ler o arquivo: ${err instanceof ErroLeitura ? err.message : "formato inválido ou corrompido."}`);
    } finally {
      e.target.value = ""; // permite escolher o mesmo arquivo de novo
    }
  };

  const buscar = () => {
    if (!indice) return;
    const saida: Linha[] = [];
    for (const line of enderecos.split("\n").map((s) => s.trim()).filter(Boolean)) {
      const { nome, end: q } = splitLine(line);
      const m = lookup(indice, q);
      if (!m.hits.length) saida.push({ line, nome, q, status: m.status });
      else m.hits.forEach((h) => saida.push({ line, nome, q, status: m.status, h }));
    }
    setLinhas(saida);
  };

  const baixarPlanilha = async () => {
    if (!linhas) return;
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(linhas.map(linhaPlanilha));
    ws["!cols"] = Object.keys(linhaPlanilha({ line: "", nome: "", q: "", status: "" })).map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Áreas");
    XLSX.writeFile(wb, "conferencia-areas.xlsx");
  };

  const comResultado = linhas ? new Set(linhas.filter((r) => r.h).map((r) => r.line)).size : 0;
  const total = linhas ? new Set(linhas.map((r) => r.line)).size : 0;

  return (
    <>
      <div className="areas__topo">
        <div>
          <h1>Conferência de Áreas — São Paulo</h1>
          <p className="subtitulo">
            Encontre área do terreno, SQL, zoneamento e IPTU estimado a partir de uma lista de endereços.
          </p>
        </div>
        <div className="areas__base nao-imprimir" title="Quando a Prefeitura publica o IPTU do ano seguinte, o site é atualizado e mostra o aviso de versão nova.">
          <span>Base de dados</span>
          <b>Cadastro do IPTU {ano}</b>
        </div>
      </div>

      <section className="areas__cartao nao-imprimir">
        <h2>1. Envie o documento ou cole os endereços</h2>
        <label className="seletor areas__arquivo">
          <span className="botao">Escolher arquivo</span>
          <span className="seletor__dica">PDF, Word (.docx) ou texto</span>
          <input type="file" accept=".pdf,.docx,.txt" className="visualmente-oculto" onChange={lerArquivo} />
        </label>
        <p className="caso__meta">
          Os endereços encontrados aparecem abaixo — confira e corrija antes de buscar. Um endereço por linha;
          opcionalmente “Nome | endereço”.
        </p>
        <label className="campo">
          Endereços
          <textarea
            className="areas__enderecos"
            value={enderecos}
            onChange={(e) => setEnderecos(e.target.value)}
            placeholder={"Ex.:\nAvenida das Nações Unidas, 12901\nRua Frei Caneca 569"}
          />
        </label>
        <div className="acoes">
          <button type="button" className="botao" disabled={!indice} onClick={buscar}>
            Buscar
          </button>
          {erro ? (
            <span className="erro" role="alert">
              {erro}
            </span>
          ) : (
            <span className="status" role="status">
              {status}
            </span>
          )}
        </div>
      </section>

      {linhas && (
        <section className="areas__cartao">
          <h2>2. Resultado</h2>
          <div className="acoes nao-imprimir">
            <button type="button" className="botao" onClick={baixarPlanilha}>
              Baixar planilha (Excel)
            </button>
            <button type="button" className="botao botao--secundario" onClick={() => window.print()}>
              Imprimir
            </button>
            <span className="status">
              {comResultado} de {total} endereços com resultado.
            </span>
          </div>
          <div className="areas__tabela">
            <table>
              <thead>
                <tr>
                  <th className="nao-imprimir">Nome</th>
                  <th>Endereço informado</th>
                  <th className="nao-imprimir">Situação</th>
                  <th>SQL</th>
                  <th className="nao-imprimir">Endereço no cadastro</th>
                  <th>Área do terreno (m²)</th>
                  <th>Zoneamento</th>
                  <th>IPTU estimado (R$/ano)</th>
                  <th className="nao-imprimir">
                    <span className="visualmente-oculto">Conferir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((r, i) => {
                  const o = linhaPlanilha(r);
                  return (
                    <tr key={i}>
                      <td className="nao-imprimir">{o.Nome}</td>
                      <td>{o["Endereço informado"]}</td>
                      <td className="nao-imprimir">
                        <span className={seloSituacao(r.status)}>{r.status}</span>
                      </td>
                      <td className="areas__nowrap">{o.SQL}</td>
                      <td className="nao-imprimir">
                        {o["Endereço no cadastro"]} {o.Bairro ? `— ${o.Bairro}` : ""}
                      </td>
                      <td className="areas__num">{m2(o["Área do terreno (m²)"])}</td>
                      <td>{o.Zoneamento}</td>
                      <td className="areas__num">{brl(o["IPTU estimado terreno (R$/ano)"])}</td>
                      <td className="nao-imprimir">
                        {o.SQL && (
                          <a href={CONSULTA} target="_blank" rel="noopener noreferrer" title={`Abra e informe o SQL ${o.SQL}`}>
                            conferir
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="alerta">
        Fonte: Cadastro Imobiliário Fiscal (IPTU) da Prefeitura de São Paulo, publicado no GeoSampa — exercício {ano}.
        Área e SQL vêm do cadastro oficial. O <strong>zoneamento</strong> é o da Lei 18.081/24 (mapa do GeoSampa), cruzado
        com o desenho do lote; quando o lote fica em mais de uma zona, aparecem todas que cobrem ao menos 10% dele, a maior
        primeiro. Confirme no GeoSampa antes de decidir. O <strong>IPTU estimado</strong> é área × valor do m² do terreno ×
        1,5% — só uma aproximação (não conta construção, descontos, isenções nem a trava de reajuste). Para o IPTU exato,
        use o link “conferir” de cada SQL.
      </p>
    </>
  );
}
