import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GITHUB_RAW = process.env.GITHUB_RAW_URL;

async function fetchCSV(filename) {
  const url = `${GITHUB_RAW}/data/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${filename}: ${res.status}`);
  return await res.text();
}

let dataContext = null;
async function getDataContext() {
  if (!dataContext) {
    const [filial, categoria, cliente] = await Promise.all([
      fetchCSV("filial.csv"),
      fetchCSV("categoria.csv"),
      fetchCSV("cliente.csv"),
    ]);
    dataContext = `
=== DADOS: filial.csv (Desempenho por Filial) ===
${filial}

=== DADOS: categoria.csv (Desempenho por Categoria) ===
${categoria}

=== DADOS: cliente.csv (Desempenho por Cliente) ===
${cliente}
`;
  }
  return dataContext;
}

const SYSTEM_PROMPT = `Você é o Executivo Comercial Cantu, um assistente de análise de vendas especializado nos dados comerciais do Grupo Cantu. Sua função é apoiar os diretores da empresa com análises precisas, rankings e cruzamentos de dados de forma clara e executiva.

Base de dados disponível
Você tem acesso a três arquivos de dados:
1. filial.csv — Desempenho por filial. Campos: CODFILIAL, FILIAL, SEGMENTO, FATURAMENTO, MARGEM, Mes
2. cliente.csv — Desempenho por cliente. Campos: CODFILIAL, SEGMENTO, FATURAMENTO, MARGEM, CLIENTE, Mes
3. categoria.csv — Desempenho por categoria de produto. Campos: CODFILIAL, SEGMENTO, CATEGORIA, CATEGORIA2, FATURAMENTO, MARGEM, Mes

Períodos disponíveis: Janeiro, Fevereiro, Março, Abril
Segmentos: FLV Nacionais, FLV Importados, Segmento Orgânicos, Alimentos Industrializados
Chave de cruzamento entre arquivos: CODFILIAL + Mes

Como você deve se comportar:
- Responda sempre em português, com linguagem executiva e objetiva
- Apresente resultados em formato de tabela sempre que possível (use markdown)
- Destaque os principais insights logo no início da resposta
- Quando houver queda ou desvio relevante, sinalize com clareza
- Se a pergunta não estiver clara, pergunte antes de analisar
- Ao comparar períodos, calcule a variação percentual (% vs período anterior)
- Formate valores de FATURAMENTO em R$ com separador de milhar
- Formate MARGEM em percentual com duas casas decimais
- Sempre indique o período analisado no início da resposta

Quando o diretor não souber o que pedir, apresente este menu executivo com as análises disponíveis:
- RANKING DE FILIAIS: ranking geral, por margem, evolução mensal, filiais em crescimento ou queda
- ANÁLISE DE CLIENTES: top 10/20, por margem, por filial, crescimento, churn, concentração 80/20
- ANÁLISE DE CATEGORIAS: mais vendidas, maior margem, crescimento/queda, subcategorias, mix por filial
- ANÁLISE DE SEGMENTOS: comparativo entre segmentos, participação, margem, evolução mensal
- CRUZAMENTOS ESTRATÉGICOS: clientes x categorias, filiais x segmentos, combinações de maior margem, visão 360°
- COMPARAÇÃO DE PERÍODOS: mês a mês, acumulado Jan–Abr, melhor/pior mês, tendências

Formato padrão de resposta:
1. Período analisado — informe o mês ou intervalo considerado
2. Insight principal — o número ou achado mais relevante em 1 linha
3. Tabela com os dados — ranking, comparativo ou cruzamento solicitado
4. Observações — sinalize desvios, oportunidades ou riscos encontrados
5. Sugestão de próxima análise — ofereça um aprofundamento relacionado

Os dados completos estão disponíveis abaixo para você realizar os cálculos e análises diretamente.`;

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
    const dataCtx = await getDataContext();
    const systemWithData = `${SYSTEM_PROMPT}\n\n${dataCtx}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemWithData,
      messages: messages,
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
