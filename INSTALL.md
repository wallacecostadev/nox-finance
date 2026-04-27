# 🚀 GUIA DE INSTALAÇÃO - NOX FINANCE

## Passo 1: Instalar Node.js (se ainda não tem)

1. Baixe em: https://nodejs.org/
2. Escolha a versão **LTS** (recomendada)
3. Instale com opções padrão
4. Abra o terminal e digite `node --version` para confirmar

---

## Passo 2: Testar localmente

Abra o terminal na pasta do projeto:

```bash
cd C:\Users\walla\desktop\projeto-ai\nox-finance
npm install
npm start
```

Se aparecer a mensagem do servidor rodando, está pronto!

---

## Passo 3: Criar conta no Render.com (Hospedagem Grátis)

1. Acesse https://render.com
2. Clique em **Sign Up**
3. Use sua conta do GitHub ou crie com email
4. Após logar, clique em **New +** → **Web Service**

### Configurar o serviço:

| Campo | Valor |
|-------|-------|
| Name | nox-finance |
| Region | Choose one close to you |
| Branch | main |
| Root Path | (deixe vazio) |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |

5. Clique em **Create Web Service**

### Variáveis de Ambiente (Environment Variables):

Na página do serviço, vá em **Environment** e adicione:

```
DATABASE_PATH=./nox-finance.db
WEBHOOK_SECRET=nox-secret-key-mude-depois
```

---

## Passo 4: Configurar Evolution API

A Evolution API é o que conecta seu WhatsApp ao backend.

### Opção A: Instalar localmente (se seu PC ficar 24h)

```bash
# Instalar Docker (se não tiver)
# Depois rodar:
docker run -d -p 8080:8080 --name evolution-api gabrieldev/evolution-api:latest
```

### Opção B: Usar API pronta (recomendado)

Existem alternativas:
- **Z-API** (pago, mas barato)
- **WPPConnect** (grátis, open source)
- **Venom-bot** (grátis)

---

## Passo 5: Testar o bot

Após tudo configurado, envie no WhatsApp:

```
Oi
Ajuda
Recebi 5000 do salario
Gastei 150 no mercado
Saldo atual
```

---

## 📞 Comandos Suportados

| Comando | Exemplo |
|---------|---------|
| Lançar receita | "recebi 500 do salario" |
| Lançar despesa | "gastei 150 no mercado" |
| Lançar cartão | "cartão de 200 na ifood" |
| Ver saldo | "saldo atual" |
| Ver gastos | "quanto gastei no mês?" |
| Ver extrato | "extrato da semana" |
| Ajuda | "ajuda" |

---

## 🛠️ Solução de Problemas

### Erro: "module not found"
Rode `npm install` novamente.

### Banco de dados não cria
Verifique se o arquivo `nox-finance.db` existe na pasta.

### Webhook não recebe mensagens
Verifique se a URL do webhook está correta na Evolution API.

---

## Próximos Passos

1. ✅ Testar localmente
2. ⬜ Fazer deploy no Render
3. ⬜ Configurar Evolution API ou alternativa
4. ⬜ Testar no WhatsApp
5. ⬜ Ajustar categorias e comandos

Dúvidas? Me chama! 🚀
