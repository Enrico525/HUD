// Busca de endereços na base de terrenos (vinda da Conferência de Áreas). Testes em match.test.ts.
const TIPOS = "RUA|R|AVENIDA|AV|AVN|ALAMEDA|AL|ESTRADA|ESTR|EST|ES|TRAVESSA|TV|TRV|PRACA|PC|PCA|RODOVIA|ROD|RV|VIA|LARGO|LGO|LG|VIELA|VL|VIADUTO|VD|PASSAGEM|PSG|PARQUE|PQ|PRAIA|PR|BECO|BC|PONTE|PTE|VILA|JARDIM|JD|CAMINHO|CAM|TRAV|ESTRADA MUNICIPAL";
const TIPO_RE = new RegExp(`^(${TIPOS})\\b\\s*`);
const VAZIAS = new Set("DE DA DO DOS DAS E D".split(" "));
// Títulos abreviados em um lado e por extenso no outro; removidos para comparar.
const TITULOS = new Set("DR DOUTOR PROF PROFESSOR PROFA PROFESSORA ENG ENGENHEIRO CEL CORONEL GAL GEN GENERAL PRES PRESIDENTE SEN SENADOR DEP DEPUTADO MAL MARECHAL CAP CAPITAO TEN TENENTE STA SANTA STO SANTO S SAO CONS CONSELHEIRO BRIG BRIGADEIRO DQ DUQUE COM COMENDADOR VER VEREADOR DES DESEMBARGADOR PE PADRE FR FREI MONS MONSENHOR D DOM DONA ALM ALMIRANTE MAJ MAJOR GOV GOVERNADOR VISC VISCONDE BARAO BR JORN JORNALISTA PDE SOLD SOLDADO TTE COMEN DESEM MAEST MAESTRO SARG SARGENTO COMTE CMTE COMANDANTE ARQ ARQUITETO MIN MINISTRO CARD CARDEAL DRA DOUTORA CD CONDE CDSSA CONDESSA".split(" "));

/** Terreno da base, já no formato da tela. */
export type Terreno = {
  sql: string; end: string; bairro?: string; cep?: string; num: number;
  area?: number; vm2?: number; zona?: string; n?: number;
};
/** terrenos.json gerado por areas/prep.py. */
export type Base = { ano?: string; areaMin?: number; cols: string[]; rows: (string | number)[][] };
export type Indice = { ruas: Map<string, Terreno[]>; keys: string[] };
export type Busca = { status: string; hits: Terreno[] };

export function norm(s: unknown) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[º°ª]/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export function ruaKey(nome: unknown) {
  let n = norm(nome);
  for (let i = 0; i < 2; i++) n = n.replace(TIPO_RE, ""); // "R AV" etc.
  n = n.replace(/( (N|NO|NUM|NUMERO))+$/, ""); // "nº" antes do número
  return n.split(" ").filter(t => t && !VAZIAS.has(t) && !TITULOS.has(t)).join(" ");
}

export function buildIndex(d: Base): Indice {
  const c = Object.fromEntries(d.cols.map((k, i) => [k, i]));
  const ruas = new Map<string, Terreno[]>();
  for (const r of d.rows) {
    const v = (k: string) => r[c[k]] as never;
    const h: Terreno = { sql: v("sql"), end: `${v("logradouro")}, ${v("numero")}${v("complemento") ? " " + v("complemento") : ""}`,
      bairro: v("bairro"), cep: v("cep"), num: +v("numero") || 0, area: v("area"), vm2: v("vm2"), zona: v("zona"), n: v("n") };
    const k = ruaKey(v("logradouro"));
    if (!ruas.has(k)) ruas.set(k, []);
    ruas.get(k)!.push(h);
  }
  return { ruas, keys: [...ruas.keys()] };
}

function findRuas(idx: Indice, nome: string) {
  const k = ruaKey(nome);
  if (!k) return [];
  if (idx.ruas.has(k)) return [k];
  // Palavras batem se iguais ou com 1 letra de diferença (LUIS/LUIZ); exige ≥ 75% das palavras dos dois lados.
  const q = k.split(" ");
  let best = 0, out: string[] = [];
  for (const key of idx.keys) {
    const t = key.split(" ");
    const hit = q.filter(w => t.some(x => x === w || (w.length >= 4 && x.length >= 4 && lev1(w, x)))).length;
    const s = hit / Math.max(q.length, t.length);
    if (s > best) { best = s; out = [key]; } else if (s === best) out.push(key);
  }
  return best >= 0.75 && out.length <= 5 ? out : [];
}

function lev1(a: string, b: string) { // distância de edição ≤ 1
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

export function lookup(idx: Indice, query: string): Busca {
  // Sem número (s/n ou só km de rodovia): só sinaliza, sem puxar terrenos.
  if (/\bs\s*\/\s*n\b|\bkm\b/i.test(query)) return { status: "Sem número — conferir", hits: [] };
  const q = String(query);
  // Tenta cada número do texto como "número do imóvel" (ruas como "25 de Março" têm número no nome).
  const nums = [...q.matchAll(/\d{1,6}/g)];
  let ruas: string[] = [], num = 0;
  for (const m of nums) {
    const r = findRuas(idx, q.slice(0, m.index));
    if (r.length) { ruas = r; num = +m[0]; break; }
  }
  if (!ruas.length) return { status: nums.length ? "Não encontrado" : "Sem número — conferir", hits: [] };
  const all = ruas.flatMap(k => idx.ruas.get(k)!);
  const exact = all.filter(h => h.num === num);
  if (exact.length) return { status: "Encontrado", hits: exact };
  // Terrenos grandes ocupam vários números; aceita o cadastrado mais próximo até 100.
  const near = all.filter(h => h.num > 0).map(h => [Math.abs(h.num - num), h] as const).filter(([d]) => d <= 100).sort((a, b) => a[0] - b[0]);
  if (near.length) return { status: `Aproximado (nº ${near[0][1].num})`, hits: near.filter(([d]) => d === near[0][0]).map(([, h]) => h) };
  return { status: "Rua encontrada, número não — conferir", hits: [] };
}

const END_RE = new RegExp(`\\b(RUA|R\\.|AV\\.?|AVENIDA|ALAMEDA|AL\\.|ESTRADA|ESTR\\.|TRAVESSA|TV\\.|PRA[ÇC]A|P[ÇC]A\\.?|RODOVIA|ROD\\.|LARGO|VIELA)\\s[^\\n]{2,150}`, "gi"); // até o fim da linha; lookup() acha o número
const FONE_RE = /\s*[-–|]?\s*\b(fone|tel|telefone|whatsapp)\b[\s\S]*$/i;
// Devolve linhas "Nome | endereço": o nome é o texto antes do endereço na mesma linha
// ou a linha logo acima (ex.: lista de motéis com nome e endereço em linhas seguidas).
// O leitor de Word ignora a quebra de linha entre nome e endereço ("Affinity MotelRua Doutor..."):
// quando o tipo da via vem grudado no nome (que pode terminar em maiúscula ou número), separa em outra linha.
// "Av."/"R." só depois de minúscula, senão "Dr. Arnaldo" viraria "D" + "R. Arnaldo".
const COLADO_RE = /(\S)(?=(?:Rua|Avenida|Alameda|Estrada|Travessa|Pra[çc]a|Rodovia|Largo|Viela|RUA|AVENIDA|ALAMEDA|ESTRADA|TRAVESSA|PRA[ÇC]A|RODOVIA|LARGO|VIELA)\s)|([a-zà-ÿ'’)])(?=(?:Av\.|R\.)\s)/g;
export function extractAddresses(text: string) {
  const t = String(text).replace(COLADO_RE, "$1$2\n"), out = new Set<string>();
  for (const m of t.matchAll(END_RE)) {
    const end = m[0].replace(FONE_RE, "").replace(/\s+/g, " ").replace(/[\s,;-]+$/, "").trim();
    if (!/\d|\bs\s*\/\s*n\b/i.test(end)) continue;
    const ini = t.lastIndexOf("\n", m.index - 1) + 1;
    let nome = t.slice(ini, m.index).trim();
    if (!nome && ini > 0) {
      const prev = t.slice(t.lastIndexOf("\n", ini - 2) + 1, ini - 1).trim();
      if (prev && prev.length <= 80 && !new RegExp(END_RE.source, "i").test(prev)) nome = prev;
    }
    nome = nome.replace(/[\s:|,;-]+$/, "").replace(/\s+/g, " ");
    out.add(nome ? `${nome} | ${end}` : end);
  }
  if (!out.size) t.split(/\n/).map(s => s.trim()).filter(Boolean).forEach(s => out.add(s));
  return [...out];
}
// "Nome | endereço" -> { nome, end }; linha sem " | " é só endereço.
export function splitLine(line: string) {
  const i = line.indexOf(" | ");
  return i < 0 ? { nome: "", end: line.trim() } : { nome: line.slice(0, i).trim(), end: line.slice(i + 3).trim() };
}
