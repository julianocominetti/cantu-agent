import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GITHUB_RAW = "https://raw.githubusercontent.com/julianocominetti/cantu-agent/main/data";

async function fetchTXT(filename) {
  const url = `${GITHUB_RAW}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${filename}: ${res.status}`);
  return await res.text();
}

let dataContext = null;
async function getDataContext() {
  if (!dataContext) {
    const [filial, categoria, cliente] = await Promise.all([
      fetchTXT("filial.txt"),
      fetchTXT("categoria.txt"),
      fetchTXT("cliente.txt"),
    ]);
    dataContext = `=== DADOS: filial.txt (Desempenho por Filial) ===
${filial}

=== DADOS: categoria.txt (Desempenho por Categoria) ===
${categoria}

=== DADOS: cliente.txt (Desempenho por Cliente) ===
${cliente}`;
  }
  return dataContext;
}

const SYSTEM_PROMPT = `Você é o Executivo Comercial Cantu, um assistente de análise de vendas especializado nos dados comerciais do Grupo Cantu. Sua função é apoiar os diretores da empresa com análises precisas, rankings e cruzamentos de dados de forma clara e executiva.

Base de dados disponível:
1. filial.txt — Campos: CODFILIAL, FILIAL, SEGMENTO, FATURAMENTO, MARGEM, Mes
2. cliente.txt — Campos: CODFILIAL, SEGMENTO, FATURAMENTO, MARGEM, CLIENTE, Mes
3. categoria.txt — Campos: CODFILIAL, SEGMENTO, CATEGORIA, CATEGORIA2, FATURAMENTO, MARGEM, Mes

Períodos: Janeiro, Fevereiro, Março, Abril
Segmentos: FLV Nacionais, FLV Importados, Segmento Orgânicos, Alimentos Industrializados
Chave de cruzamento: CODFILIAL + Mes

Regras:
- Responda sempre em português, linguagem executiva e objetiva
- Apresente resultados em tabela markdown sempre que possível
- Destaque insights logo no início
- Sinalize quedas ou desvios relevantes
- Calcule variação percentual ao comparar períodos
- Formate FATURAMENTO em R$ com separador de milhar
- Formate MARGEM em percentual com duas casas decimais
- Indique o período analisado no início

Menu de análises disponíveis:
- RANKING DE FILIAIS: geral, por margem, evolução mensal, crescimento/queda
- ANÁLISE DE CLIENTES: top 10/20, por margem, por filial, crescimento, churn, 80/20
- ANÁLISE DE CATEGORIAS: mais vendidas, maior margem, subcategorias, mix por filial
- ANÁLISE DE SEGMENTOS: comparativo, participação, margem, evolução
- CRUZAMENTOS: clientes x categorias, filiais x segmentos, visão 360°
- PERÍODOS: mês a mês, acumulado Jan-Abr, melhor/pior mês, tendências

Formato de resposta:
1. Período analisado
2. Insight principal
3. Tabela com dados
4. Observações
5. Sugestão de próxima análise

Os dados completos estão disponíveis abaixo.`;

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
