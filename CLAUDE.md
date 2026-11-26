# Contexto do projeto

**HUD** (11/2026): este repositório junta dois sites num só, com menu lateral e identidade visual LYD CRM
(`src/styles.css`, `src/components/Logo.tsx`): a Conferência Financeira (abaixo, vinda do FinanceiroSPL) e a
Conferência de Áreas (`src/components/ConferenciaAreas.tsx`, `src/areas/`, dados em `public/areas/terrenos.json`,
scripts de atualização em `areas/`). A de Áreas usa só dado público da Prefeitura, não guarda nada (o aviso de novidade com localStorage do site antigo saiu; vale o `AvisoAtualizacao`).
Do repo `Confer-ncia-reas` (25/11/2026) veio só o indicativo "Base de dados: Cadastro do IPTU <ano>", num quadro no canto superior direito; a escolha de
tema claro/escuro (localStorage) e o `robo-iptu.ps1` não foram trazidos.

Plataforma **interna** da Special Imóveis para conferir **Recibos do Locatário × Extratos de Repasse** exportados do
sistema NIDO. A conferência roda **no navegador, com regras fixas e sem IA** (`src/nido/`); regras de negócio em
`docs/REGRAS-CONFERENCIA.md`. Toda a aplicação em **português brasileiro**.

## Regras inegociáveis

- **Sem banco de dados e sem persistência** de PDFs, textos, resultados ou histórico. Nada de D1, R2, KV, IndexedDB, localStorage, sessionStorage.
- **O PDF original nunca sai do navegador.** Só o texto extraído (por página) vai ao Worker.
- **Chave da OpenAI só como Secret** (`OPENAI_API_KEY`). Nunca no frontend, repositório ou logs.
- Chamadas à OpenAI sempre com `store: false`, sem tools, saída em JSON Schema estrito.
- **Logs só com categorias de erro.** Nunca corpo da requisição, texto, resposta da IA ou mensagens de exceção.
- Conteúdo de PDF e da IA é **não confiável**: renderizar só como texto (sem `dangerouslySetInnerHTML`, sem markdown).
- Autorização validada no Worker em toda requisição (cookie de sessão assinado + usuário ainda cadastrado em `USUARIOS`).
- A IA não é autoridade: cálculos e conferências determinísticos ficam no código.
- Não inventar regras de negócio: perguntar.

## Decisões tomadas

- **Sem login no app (11/2026, pedido do dono):** o frontend não pede nome/senha nem chama `/api/eu`; a tela de
  login (`Login.tsx`) foi removida. O Worker continua exigindo sessão em `/api/*`, o que hoje só protege a rota
  `/api/analisar` (OpenAI, sem uso). Não reabrir essa rota sem login: viraria proxy aberto para a chave da OpenAI.

- Stack: React + Vite + TypeScript, Cloudflare Worker com Static Assets (uma app, mesmo domínio).
- Script de cadastro de usuários (`scripts/usuarios.ts`) removido (11/2026), junto com o login. `shared/credenciais.ts` continua porque o Worker ainda valida sessão em `/api/*`.
- Assets estáticos são públicos (não contêm dados); só a API exige login.
- Contrato frontend↔Worker em `shared/contrato.ts` (zod). O mesmo schema vira o JSON Schema enviado à OpenAI.
- Conferência de referências: todo `trecho_literal` citado pela IA é procurado na página indicada (`src/conferencia.ts`).

- Conferência NIDO (11/2026): os PDFs do NIDO têm layout fixo, então a leitura (`src/nido/ler.ts`) e as regras
  (`src/nido/conferir.ts`) são determinísticas, em centavos inteiros. A IA foi dispensada; `worker/openai.ts` e
  `/api/analisar` continuam no Worker sem uso pelo app.
- Rota OpenAI (11/2026): fica no Worker, sem uso por enquanto; não remover sem o negócio pedir.
- Hospedagem (11/2026): segue no `*.workers.dev` da Cloudflare, sem domínio próprio (uso temporário).
- PDF gerado por "Imprimir → Microsoft Print to PDF" não tem texto (letras viram desenho): o app recusa e pede o
  relatório exportado direto do NIDO. OCR não é necessário.
- Juntar PDF (11/2026): página que junta vários Extratos de Repasse num PDF só (`src/pdf/juntar.ts`, pdf-lib,
  copiando as páginas originais) e só **baixa** o arquivo para o computador; o app lê esse PDF como qualquer outro.
  Lateral com 3 páginas: Juntar PDF, Repasses únicos (modo "um") e Repasses juntados (modo "geral").
- Lançamentos manuais (11/2026): repasses feitos por fora do NIDO (sem extrato) são digitados no relatório, com a
  conta (Itaú/Bradesco); só somam nos totais, sem conferência, e ficam só em memória.
- Dados bancários no relatório (11/2026): CPF/CNPJ, forma, banco, agência, conta, tipo e descrição do cabeçalho do
  extrato aparecem em cada contrato do relatório (tela e impressão), só como texto e só em memória.
- Relatório de repasses (11/2026): é para pagar, não para conferir. Uma tabela por conta de saída (Itaú, Bradesco,
  sem banco) com contrato, proprietário + CPF/CNPJ, dados bancários e valor, em destaque; sem a lista de
  apontamentos e conferidos (ficam na tela de resultado). Recibo sem extrato e extrato só de caução ficam fora.
- Extrato excluído pela pessoa (11/2026): o contrato sai do resultado e do relatório, em vez de virar "recibo sem
  extrato" (`conferirSem`).
- Taxa de intermediação (11/2026): o normal é 100% do aluguel, mas varia conforme o acordo (fora do PDF); diferente
  de 100% continua indo para conferência manual.
- Taxa Adm no recibo (11/2026): só é certa por acordo do contrato (ex.: 7840), então vira conferência manual.
- Juros (11/2026): são cobrados só sobre o aluguel e entram na base da taxa ADM, junto com a multa.
- Depósito caução (11/2026): a linha "Depósito Caução" do extrato nunca soma nos totais do relatório (`totais`);
  a conferência do contrato não muda.
- Pesquisa de contrato nas tabelas de pagamento do relatório (11/2026): só esconde na tela (`oculto-na-tela`);
  totais e impressão continuam com todos os contratos. Ela e a da lista da soma aceitam número do contrato ou nome
  do proprietário (com letras, busca no nome sem acento/maiúscula). As duas também têm um campo de valor (só os
  dígitos contam; nas tabelas de pagamento é o valor mostrado, já sem caução).
- Titular da conta na impressão (11/2026): o NIDO não tem campo de beneficiário; só na impressão, a "Descrição" do
  extrato (quando existe) vai em destaque na coluna Proprietário e o nome do proprietário fica menor embaixo. Na tela
  nada muda. Descrição só com símbolos (o NIDO traz "***" em cadastros sem observação) é ignorada.
- Extrato em duas versões (11/2026): mesmo número e proprietário com conteúdo diferente é divergência (antes o
  primeiro ficava em silêncio); cópia idêntica continua contando uma vez.
- Taxa ADM sem linha "Aluguel" (acordos, 11/2026): conferência manual, sem calcular a base.
- Troca de conta à mão (11/2026): na tabela de pagamentos, qualquer repasse (mesmo com banco no extrato) pode ser
  mudado de conta ("Pagar pelo Itaú/Bradesco"); usa as mesmas `escolhas` do "sem banco" (`contaDoRepasse`), só em
  memória, e a impressão mostra "Conta trocada à mão". (Criada para o 14481, que no fim estava certo: contrato
  dividido, uma metade em cada banco.)
- Dupla checagem da soma (11/2026): ao ler um PDF de extratos, o app conta os extratos direto do texto
  ("Total Pendente Contrato N", `extratosNaoLidos`) e **recusa o arquivo** se não bater com o que foi lido (extrato
  sem ler some da soma em silêncio; o `extrato-de-repasse-8.pdf` antigo cai nisso). No relatório, extrato com valor
  diferente da soma das linhas aparece em vermelho no topo (bloco `Barrados`), mesmo sem recibo.
- Lotes anteriores já pagos (11/2026): campo opcional com os PDFs dos lotes já pagos, só em memória. Extrato com o
  mesmo número e proprietário de um lote anterior (`jaPagosAntes`) sai da soma e aparece em vermelho no topo até a
  pessoa liberar. Caso real: 14793 baixado de novo em 17/11 porque o lote de 16/11 ficou aberto no NIDO.
- Extrato de R$ 0,00 (11/2026): fora da soma, da contagem e do quadro "sem banco", como o só de caução.
- Linhas iguais no mesmo extrato (11/2026): dois lançamentos com o mesmo histórico e valor (ex.: dois "Condomínio")
  são lançamentos distintos, não partes de proprietários diferentes (antes viravam divergência falsa).
- Crédito e débito na mesma linha (11/2026): o líquido manda (11039: IPTU em Contas PG Special é retido); "Taxa
  Expediente" sem "de" também fica retida (8867).
- Honorário judicial (11/2026): fica sempre com a Special (retido, como a taxa de expediente).
- Vários repasses na mesma competência (11/2026): só é duplicidade com o mesmo vencimento; vencimentos diferentes são
  boletos diferentes (inquilino que estava devendo, acordo: 14990).
- Aviso de versão nova (11/2026): a cada 30 s e ao voltar para a aba, o app compara o `/assets/index-*.js` do
  index.html do servidor com o carregado (`AvisoAtualizacao.tsx`) e mostra "Atualizar agora". Atualizar limpa a tela.
- Represados sem banco (26/11/2026): do FinanceiroSPL veio só a separação, sem Supabase. Os nomes (11) ficam no Secret
  `REPRESADOS` (JSON com os nomes como no extrato; nunca no código). O nome tem de ser o inteiro do extrato:
  empresa com a razão social completa ("… Empreendimentos Imobiliarios LTDA"; nome curto não bate) e, em contrato
  partilhado, cada proprietário separado. Gravado em 26/11/2026 com os 11 (as 2 empresas corrigidas para o nome
  completo). Lista gravada (26/11/2026): Cintia Helena Manzoli Biazzi e Monica Regina Manzoli Lowy (partilhadas),
  Space Flex Empreendimentos Imobiliarios LTDA, Iones Empreendimentos Imobiliarios LTDA, Francisca dos Anjos Custoias e
  Faustino de Deus Custoias (partilhados), José Augusto Amaral, Natalia de Souza Amaral, Rosemeire Aparecida Teixeira,
  Carlos Alberto Teixeira, Gilberto José Teixeira. Mudou a lista aqui = regravar o Secret (é ele que vale). Regravar: `npx wrangler secret put REPRESADOS --name hud` e colar `["Nome 1","Nome 2"]` (vale na hora). Ao "Conferir" e "Analisar de novo", o app
  manda os proprietários do lote para `POST /api/represados` (sem login, rate limit por IP) e recebe só os que estão na
  lista; `separarRepresados` tira os extratos deles e os recibos só deles (contrato dividido com quem não é represado
  fica nos dois). Comparação por `nomeSimples` (sem acento, maiúscula, espaço e pontuação). Secret ausente/inválido =
  a conferência não começa. Os separados só aparecem no relatório em "Represados desta leva (fora da soma)", na tela,
  e somem com a conferência, sem guardar de um dia para outro. A página "Represados" da lateral é só esqueleto (texto
  "em breve"): anexar os PDFs dos represados e conferir um proprietário por vez fica para quando o negócio pedir.
- Testes usam só dados fictícios. **Nunca** versionar PDFs ou textos reais (têm CPF, nomes, contas).

## Pendências (aguardando o negócio)

- Juros de condomínio são repassados mas **não** entram na base da taxa ADM (hoje o código soma todos os juros):
  falta saber como a linha aparece no extrato e se a multa de condomínio segue a mesma regra. Perguntas para o
  financeiro em `docs/REGRAS-PARA-FINANCEIRO.md`.
- Gerar a remessa de pagamento do Itaú (SISPAG CNAB 240) com os repasses que bateram 100% e estão "AGUARDANDO
  EFETIVAÇÃO": pausado a pedido do negócio. Faltam: tabela nome do banco → código, origem do "seu número", formas de
  pagamento além de transferência, onde guardar os dados da conta da Special (Secret no Worker) e validar com o Itaú.

## Estrutura

- `src/` frontend (`pdf/extrair.ts` leitura local, `pdf/juntar.ts` Juntar PDF, `nido/ler.ts` + `nido/conferir.ts` conferência e totais, `api.ts`, `components/` com resultado e relatório em `Resultado.tsx`)
- `worker/` API (`auth.ts` sessão + lista, `login.ts` nome/senha, `sessao.ts` cookies assinados, `openai.ts`, `index.ts` rotas/validação/rate limit)
- `shared/` contrato e limites

Atualize este arquivo e ARCHITECTURE/SECURITY/PRIVACY quando decisões mudarem.
