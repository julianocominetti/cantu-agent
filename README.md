# 📊 Executivo Comercial Cantu

Agente de análise de vendas do Grupo Cantu, com interface de chat protegida por senha.

---

## 🚀 Como publicar no Vercel

### 1. Suba para o GitHub

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cantu-agent.git
git push -u origin main
```

### 2. Importe no Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **"Add New Project"**
3. Importe o repositório do GitHub
4. Configure as **Environment Variables**:

| Variável | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (sua chave da API) |
| `ACCESS_PASSWORD` | senha que os colegas usarão para acessar |

5. Clique em **Deploy** ✅

### 3. Compartilhe com os colegas

Envie a URL do Vercel + a senha de acesso para seus colegas.

---

## 📁 Estrutura do projeto

```
cantu-agent/
├── api/
│   └── chat.js          ← backend (API Key fica aqui, protegida)
├── public/
│   └── index.html       ← interface do chat
├── data/
│   ├── filial.csv
│   ├── cliente.csv
│   └── categoria.csv
├── .env.example         ← modelo de variáveis de ambiente
├── .gitignore           ← protege o .env
├── package.json
└── vercel.json
```

---

## 🔒 Segurança

- A `ANTHROPIC_API_KEY` fica **apenas nas variáveis de ambiente do Vercel** — nunca no código ou no GitHub
- O acesso ao chat é protegido por **senha** (`ACCESS_PASSWORD`)
- Os colegas nunca têm acesso ao código-fonte, apenas à interface do chat

---

## 🔄 Atualizar os dados

Para atualizar a base de dados:

1. Substitua os arquivos em `/data/`
2. Faça commit e push para o GitHub
3. O Vercel faz o deploy automaticamente

---

## 📊 Dados disponíveis

| Arquivo | Registros | Descrição |
|---|---|---|
| `filial.csv` | 106 | Desempenho por filial |
| `categoria.csv` | 3.746 | Desempenho por categoria |
| `cliente.csv` | 12.346 | Desempenho por cliente |

**Período:** Janeiro a Abril  
**Segmentos:** FLV Nacionais · FLV Importados · Orgânicos · Industrializados
