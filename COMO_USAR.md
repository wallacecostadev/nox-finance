# 🚀 COMO COLOCAR NO AR - NOX FINANCE

## Status do Projeto

✅ **PRONTO:** Backend criado e testado  
⬜ **PENDENTE:** Configurar WhatsApp (Evolution API)

---

## Passo 1: Testar Localmente (Opcional)

Se quiser testar no seu PC antes de colocar no ar:

```bash
# 1. Instalar Node.js (se não tem): https://nodejs.org/ (versão LTS)

# 2. Abrir terminal na pasta do projeto
cd C:\Users\walla\desktop\projeto-ai\nox-finance

# 3. Instalar dependências
npm install

# 4. Rodar o servidor
npm start

# 5. Testar se está funcionando:
# Abra o navegador em http://localhost:3000
```

Se aparecer `{"status":"ok","message":"Nox Finance API rodando!"}` está tudo certo!

---

## Passo 2: Subir para o Render (Hospedagem Grátis)

### 2.1 Criar repositório no GitHub

1. Acesse https://github.com
2. Clique em **New** (ou **+** → **New repository**)
3. Nome: `nox-finance`
4. Deixe como **Public**
5. Clique em **Create repository**

### 2.2 Enviar o código para o GitHub

No terminal, na pasta do projeto:

```bash
# Se não tem git instalado, baixe em: https://git-scm.com/

git init
git add .
git commit -m "Nox Finance - versão inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/nox-finance.git
git push -u origin main
```

### 2.3 Criar o serviço no Render

1. Acesse https://render.com e faça login (use sua conta do GitHub)
2. Clique em **New +** → **Web Service**
3. Preencha:
   - **Name:** `nox-finance`
   - **Region:** escolha o mais perto (ex: Oregon)
   - **Branch:** `main`
   - **Root Path:** deixe vazio
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

4. Clique em **Create Web Service**

### 2.4 Configurar Variáveis de Ambiente

Na página do seu serviço no Render:

1. Vá em **Environment**
2. Adicione:
   ```
   DATABASE_PATH=./nox-finance.db
   WEBHOOK_SECRET=nox-secret-key-mude-depois
   ```

---

## Passo 3: Configurar WhatsApp (Evolution API)

### Opção A: Evolution API (Grátis, mas requer servidor)

A Evolution API precisa de um servidor com Docker. No Render grátis não é possível rodar Docker, então temos duas opções:

**Opção A1:** Usar um VPS grátis (Oracle Cloud Free Tier, Google Cloud Free Tier)  
**Opção A2:** Usar uma API paga pronta (recomendado para produção)

### Opção B: Usar Z-API (Pago, mas barato e fácil)

1. Acesse https://z-api.io
2. Crie uma conta
3. Crie uma instância
4. Configure o webhook para: `https://nox-finance.onrender.com/api/webhook`

### Opção C: Usar WPPConnect (Grátis, open source)

1. Acesse https://github.com/wppconnect-team/wppconnect
2. Siga as instruções de instalação

---

## Passo 4: Testar no WhatsApp

Após configurar o webhook:

1. Envie no WhatsApp: `ajuda`
2. A resposta deve ser a lista de comandos
3. Teste os comandos:
   - `recebi 5000 do salario`
   - `gastei 150 no mercado`
   - `saldo atual`
   - `quanto gastei no mes?`

---

## Resumo dos Arquivos

| Arquivo | O que faz |
|---------|-----------|
| `index.js` | Servidor principal |
| `db.js` | Banco de dados SQLite |
| `routes.js` | Rotas da API e processamento |
| `parser.js` | Entende mensagens do usuário |
| `test.js` | Testes do parser |
| `.env` | Variáveis de ambiente |
| `package.json` | Dependências |

---

## Próximos Passos

1. ✅ Testar localmente
2. ⬜ Fazer deploy no Render
3. ⬜ Configurar WhatsApp (Evolution API ou Z-API)
4. ⬜ Testar comandos no WhatsApp
5. ⬜ Ajustar categorias e melhorias

---

## Dúvidas?

O projeto está em: `C:\Users\walla\desktop\projeto-ai\nox-finance`
