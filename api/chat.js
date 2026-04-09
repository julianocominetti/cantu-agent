import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GITHUB_RAW = "https://raw.githubusercontent.com/julianocominetti/cantu-agent/main/data";

async function fetchTXT(filename) {
  const url = `${GITHUB_RAW}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${filename}: ${res.status}`);
  return await res.text();
}

// Cache dos arquivos
const cache = {};
async function getData(filename) {
  if (!cache[filename]) cache[filename] = await fetchTXT(filename);
  return cache[filename];
}

// Detecta quais arquivos são necessários para a pergunta
function detectarArquivos(pergunta) {
  const p = pergunta.toLowerCase();
  const arquivos = [];

  const usaFilial = p.includes("filial") || p.includes("loja") || p.includes("unidade") || p.includes("ranking") || p.includes("resumo") || p.includes("geral");
  const usaCliente = p.includes("cliente") || p.includes("comprador") || p.includes("churn") || p.includes("top") || p.includes("concentra");
  const usaCategoria = p.includes("categor") || p.includes("produto") || p.includes("mix") || p.includes("item") || p.includes("segmento");

  if (usaFilial || (!usaCliente && !usaCategoria)) arquivos.push("filial.txt");
  if (usaCliente) arquivos.push("cliente.txt");
  if (usaCategoria || p.includes("segment")) arquivos.push("categoria.txt");

  // Se não detectou nada específico, carrega filial e categoria (mais leves)
  if (arquivos.length === 0) arquivos.push("filial.txt", "categoria.txt");

  return arquivos;
}

const SYSTEM_PROMPT = `Você é o Executivo Comercial Cantu, um assistente de análise de vendas especializado nos dados comerciais do Grupo Cantu. Sua função é apoiar os diretores da empresa com análises precisas, rankings e cruzamentos de dados de forma clara e executiva.

Base de dados disponível:
1. filial.txt — Campos: CODFILIAL, FILIAL, SEGMENTO, FATURAMENTO, MARGEM, Mes
2. cliente.txt — Campos: CODFILIAL, SEGMENTO, FATURAMENTO, MARGEM, CLIENTE, Mes
3. categoria.txt — Campos: CODFILIAL, SEGMENTO, CATEGORIA, CATEGORIA2, FATURAMENTO, MARGEM, Mes

Períodos disponíveis: Janeiro, Fevereiro, Março e Abril de 2026. IMPORTANTE: sempre use o ano 2026 ao mencionar datas nas respostas. Nunca use 2024 ou 2025.

REGRA OBRIGATÓRIA — UNIFICAÇÃO DE FILIAIS:
Antes de qualquer análise, some TODOS os valores das filiais "Celso Ramos" e "Cristal Verde" mês a mês e trate como uma única filial chamada "Celso Ramos / Cristal Verde". Some Jan+Jan, Fev+Fev, Mar+Mar, Abr+Abr e TOTAL+TOTAL dessas duas filiais. Nunca as exiba separadas em nenhuma tabela, ranking ou gráfico.

REGRA OBRIGATÓRIA — RANKING DE FILIAIS:
Quando solicitado ranking de filiais:
1. Primeiro some os dados de Celso Ramos + Cristal Verde em cada mês
2. Exiba uma única tabela com colunas: FILIAL | Jan | Fev | Mar | Abr | TOTAL
3. Ordene pelo TOTAL decrescente (maior faturamento acumulado primeiro)
4. Não inclua coluna de variação percentual
5. Não quebre em múltiplas tabelas
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

Regras de exibição de dados:
- Sempre limite rankings de clientes ao TOP 12 por faturamento
- Sempre limite rankings de categorias ao TOP 12 por faturamento
- Para filiais mostre todas (são poucas)
- Isso garante melhor visualização e leitura dos relatórios

Formato de resposta:
1. Período analisado
2. Insight principal
3. Tabela com dados (máximo 12 linhas para clientes e categorias)
4. Observações
5. Sugestão de próxima análise

Os dados necessários para responder esta pergunta estão disponíveis abaixo.`;

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
    // Detecta quais arquivos carregar baseado na última pergunta
    const ultimaMensagem = messages[messages.length - 1]?.content || "";
    const arquivosNecessarios = detectarArquivos(ultimaMensagem);

    // Carrega só os arquivos necessários em paralelo
    const dadosCarregados = await Promise.all(
      arquivosNecessarios.map(async (filename) => {
        const conteudo = await getData(filename);
        return `=== DADOS: ${filename} ===\n${conteudo}`;
      })
    );

    const systemWithData = `${SYSTEM_PROMPT}\n\n${dadosCarregados.join("\n\n")}`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
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
