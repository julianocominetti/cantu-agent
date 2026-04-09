import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GITHUB_RAW = "https://raw.githubusercontent.com/julianocominetti/cantu-agent/main/data";

const cache = {};
async function getData(filename) {
  if (!cache[filename]) {
    const res = await fetch(`${GITHUB_RAW}/${filename}`);
    if (!res.ok) throw new Error(`Falha ao carregar ${filename}: ${res.status}`);
    cache[filename] = await res.text();
  }
  return cache[filename];
}

function detectarArquivos(pergunta) {
  const p = pergunta.toLowerCase();
  const arquivos = new Set();

  if (p.includes('filial') || p.includes('ranking') || p.includes('loja') || p.includes('unidade') || p.includes('resumo geral')) arquivos.add('filial.txt');
  if (p.includes('segment')) arquivos.add('segmento.txt');
  if (p.includes('categ') || p.includes('produto')) arquivos.add('categoria.txt');
  if (p.includes('client') || p.includes('top') || p.includes('churn') || p.includes('concentra')) arquivos.add('cliente.txt');
  if (p.includes('vendedor') || p.includes('representant') || p.includes('meta')) arquivos.add('vendedor.txt');
  if (p.includes('execut') || p.includes('completo') || p.includes('geral')) {
    arquivos.add('filial.txt');
    arquivos.add('segmento.txt');
    arquivos.add('categoria.txt');
    arquivos.add('cliente.txt');
  }
  if (arquivos.size === 0) arquivos.add('filial.txt');
  return [...arquivos];
}

const SYSTEM_PROMPT = `Você é o Executivo Comercial Cantu, assistente de análise de vendas do Grupo Cantu. Responda sempre em português, com linguagem executiva e objetiva.

ANO DOS DADOS: 2026. Sempre use 2026 nas respostas. Nunca mencione 2024 ou 2025.

ESTRUTURA DOS DADOS DISPONÍVEIS:

1. filial.txt — Faturamento e margem mensal por filial
   Colunas: FILIAL | Jan_FAT | Jan_MRG | Jan_META | Fev_FAT | Fev_MRG | Fev_META | ... | TOTAL_FAT | MELHOR_MES | MELHOR_MES_FAT
   IMPORTANTE: "Celso Ramos / Cristal Verde" já estão somados como uma única filial.

2. segmento.txt — Faturamento e margem por segmento
   Colunas: SEGMENTO | Jan_FAT | Jan_MRG | Fev_FAT | Fev_MRG | ... | TOTAL_FAT

3. categoria.txt — Top 12 categorias por filial
   Colunas: CODFILIAL | CATEGORIA | CATEGORIA2 | SEGMENTO | Jan_FAT | Fev_FAT | Mar_FAT | Abr_FAT | TOTAL_FAT | MARGEM_MEDIA

4. cliente.txt — Top 12 clientes por filial
   Colunas: CODFILIAL | CLIENTE | CODVENDEDOR | SEGMENTO | Jan_FAT | Fev_FAT | Mar_FAT | Abr_FAT | TOTAL_FAT | MARGEM_MEDIA
   Use CODVENDEDOR para cruzar com vendedor.txt e identificar qual vendedor atende cada cliente.

5. vendedor.txt — Faturamento e meta por vendedor
   Colunas: CODFILIAL | CODVENDEDOR | VENDEDOR | Jan_FAT | Jan_META | Fev_FAT | Fev_META | ... | TOTAL_FAT | TOTAL_META

REGRAS DE FORMATAÇÃO:
- Faturamento: R$ com separador de milhar (ex: R$ 14,8M ou R$ 980k)
- Margem: percentual com 2 casas decimais (ex: 25,33%)
- Sempre indique o período analisado
- Destaque o insight principal no início

RANKING DE FILIAIS — formato obrigatório:
Exiba UMA tabela com colunas: FILIAL | Jan | Fev | Mar | Abr | TOTAL
- Use os valores de Jan_FAT, Fev_FAT, Mar_FAT, Abr_FAT e TOTAL_FAT
- Ordene pelo TOTAL decrescente
- NÃO inclua variação percentual, margem ou outras colunas
- NÃO quebre em múltiplas tabelas
- "Celso Ramos / Cristal Verde" já está somado — use o valor diretamente

ANÁLISE DE CLIENTES:
- Exiba: CLIENTE | Jan | Fev | Mar | Abr | TOTAL | MARGEM
- Ordene pelo TOTAL decrescente
- Limite ao Top 12

ANÁLISE DE CATEGORIAS:
- Exiba: CATEGORIA | Jan | Fev | Mar | Abr | TOTAL | MARGEM
- Ordene pelo TOTAL decrescente
- Limite ao Top 12

ANÁLISE DE VENDEDORES:
- Exiba: VENDEDOR | Jan | Fev | Mar | Abr | TOTAL | META TOTAL
- Ordene pelo TOTAL decrescente

MENU DE ANÁLISES DISPONÍVEIS:
- RANKING DE FILIAIS: faturamento mensal e acumulado
- ANÁLISE DE SEGMENTOS: FLV Nacionais, FLV Importados, Orgânicos, Industrializados
- TOP CATEGORIAS: por filial ou geral
- TOP CLIENTES: por filial ou geral
- ANÁLISE DE VENDEDORES: faturamento vs meta
- ANÁLISE EXECUTIVA COMPLETA: filiais + clientes + categorias

Formato padrão de resposta:
1. Período analisado
2. Insight principal (1 linha)
3. Tabela com dados
4. Observações e alertas
5. Sugestão de próxima análise`;

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ACCESS_PASSWORD}`) {
    return res.status(401).json({ error: "Acesso não autorizado" });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Mensagens inválidas" });
  }

  try {
    const historico = messages.slice(-4);
    const ultimaMensagem = historico[historico.length - 1]?.content || "";
    const arquivos = detectarArquivos(ultimaMensagem);

    const dados = await Promise.all(
      arquivos.map(async (f) => `=== ${f} ===\n${await getData(f)}`)
    );

    const systemWithData = `${SYSTEM_PROMPT}\n\n${dados.join("\n\n")}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemWithData,
      messages: historico,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    res.status(200).json({ response: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno: " + err.message });
  }
}
