// Testes da busca de endereços (vindos do test.js da Conferência de Áreas), só com dados fictícios.
import { assert, test } from "vitest";
import { buildIndex, lookup, extractAddresses, splitLine } from "./match";

test("busca de endereços", () => {
const idx = buildIndex({
  cols: ["sql", "logradouro", "numero", "complemento", "bairro", "cep", "area", "zona", "vm2", "n"],
  rows: [
    ["085.123.0001-1", "AV DAS NACOES UNIDAS", "12901", "", "BROOKLIN", "04578-000", 25000, 0, 3000, 1],
    ["010.020.0030-4", "R VINTE E CINCO DE MARCO", "100", "", "SE", "01021-000", 1200, 800, 5000, 1],
    ["020.030.0040-5", "R 25 DE MARCO", "300", "", "SE", "01021-000", 1500, 0, 5000, 1],
    ["030.040.0050-6", "R DR ARNALDO", "455", "", "CERQUEIRA CESAR", "01246-903", 9000, "ZEU / ZM", 4000, 1],
    ["124.030.0019-0", "AV JORN PAULO ZINGG", "1225", "", "VILA JARAGUA", "05157-030", 4646, 0, 900, 1],
    ["067.170.0028-7", "R PDE LEAO PERUCHE", "445", "", "TUCURUVI", "02309-130", 775, 0, 900, 1],
    ["083.031.0051-3", "R FERNAO DIAS", "210", "", "", "", 538, 0, 900, 1],
  ],
});

assert.strictEqual(lookup(idx, "Avenida das Nações Unidas, 12901").status, "Encontrado");
assert.strictEqual(lookup(idx, "Av. Nações Unidas nº 12901 - Brooklin").hits[0].sql, "085.123.0001-1");
assert.strictEqual(lookup(idx, "Rua 25 de Março, 300").hits[0].sql, "020.030.0040-5"); // número no nome da rua
assert.strictEqual(lookup(idx, "Rua Doutor Arnaldo 455").status, "Encontrado");      // título abreviado x por extenso
assert.match(lookup(idx, "Av Nacoes Unidas 12950").status, /^Aproximado/);
assert.strictEqual(lookup(idx, "Rua Inexistente 10").status, "Não encontrado");
assert.match(lookup(idx, "Av Nacoes Unidas 99999").status, /número não/);
assert.strictEqual(lookup(idx, "Rua Doutor Arnaldo Silva 455").status, "Não encontrado"); // só parte das palavras não basta
assert.strictEqual(lookup(idx, "Rua Dr Arnaldu 455").status, "Encontrado");             // 1 letra de diferença
assert.strictEqual(lookup(idx, "Rua Dr Arnaldo 455").hits[0].zona, "ZEU / ZM");
assert.match(lookup(idx, "Av Nacoes Unidas km 12").status, /Sem número/);
assert.strictEqual(lookup(idx, "Rodovia Fernão Dias, s/n - Km 84 - Tremembé").hits.length, 0); // sem número: só sinaliza
assert.strictEqual(lookup(buildIndex({ cols: ["sql", "logradouro", "numero"], rows: [["062.1", "AV CDSSA ELISABETH DE ROBIANO", "1792"]] }), "Av. Condessa Elisabeth de Robiano, 1792").status, "Encontrado"); // CDSSA = Condessa
assert.strictEqual(lookup(idx, "Avenida das Nações Unidas - Brooklin").status, "Sem número — conferir");
assert.strictEqual(lookup(idx, "Avenida Jornalista Paulo Zingg, 1225").status, "Encontrado");      // JORN no cadastro
assert.strictEqual(lookup(idx, "Rua Padre Leão Peruche, 445").status, "Encontrado");              // PDE no cadastro

const ext = extractAddresses("Imóvel 1: Avenida das Nações Unidas, 12901 - Área 25.000 m²\nTexto qualquer sobre a rua sem número\nR. Dr. Arnaldo, 455");
assert.strictEqual(ext.length, 2, ext.join(" / "));

// Modelo "lista de motéis": nome numa linha, endereço + telefone na seguinte.
const lista = extractAddresses("Motéis ZONA NORTE\n\nAlphis Motel\nAvenida Coronel Sezefredo Fagundes, 8150 - Tucuruvi Fone: 11 2995-2316 | 2206-8566\n\nMotel Eskimó Rua Estela Borges Morato, 271 - Freguesia do Ó - São Paulo, SP Fone: 11 3931-0645");
assert.deepEqual(lista, ["Alphis Motel | Avenida Coronel Sezefredo Fagundes, 8150 - Tucuruvi", "Motel Eskimó | Rua Estela Borges Morato, 271 - Freguesia do Ó - São Paulo, SP"]);
// Texto como o leitor de Word (mammoth) entrega: nome grudado no endereço.
const colado = extractAddresses("Motéis ZONA NORTE\n\nAffinity MotelRua Doutor Vidal Reis, 150 - Parque Novo Mundo Fone: 11 2967-2153\n\nMotel Makaku'sRua da Coroa, 1400 - Vila Guilherme\n\nHotel CantareiraAvenida Parada Pinto, 1740");
assert.deepEqual(colado, ["Affinity Motel | Rua Doutor Vidal Reis, 150 - Parque Novo Mundo", "Motel Makaku's | Rua da Coroa, 1400 - Vila Guilherme", "Hotel Cantareira | Avenida Parada Pinto, 1740"]);
// Nome terminado em maiúscula/número, endereço em maiúsculas; "Dr." não pode ser quebrado.
const colado2 = extractAddresses("MOTEL XRua Augusta, 10\n\nMotel 24Rua Augusta, 20\n\nMOTEL YRUA AUGUSTA, 30\n\nMotel BomAv. Dr. Arnaldo, 455");
assert.deepEqual(colado2, ["MOTEL X | Rua Augusta, 10", "Motel 24 | Rua Augusta, 20", "MOTEL Y | RUA AUGUSTA, 30", "Motel Bom | Av. Dr. Arnaldo, 455"]);
assert.deepEqual(splitLine(lista[0]), { nome: "Alphis Motel", end: "Avenida Coronel Sezefredo Fagundes, 8150 - Tucuruvi" });
assert.deepEqual(splitLine("Rua X, 10"), { nome: "", end: "Rua X, 10" });
});
