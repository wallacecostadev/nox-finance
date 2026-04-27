# Nox Finance - Assistente Financeiro via WhatsApp

🤖 Um assistente que gerencia suas finanças pessoais através do WhatsApp.

## Funcionalidades

- 📥 **Lançamentos**: "gastei 150 no mercado", "recebi 5000 do salario"
- 📊 **Consultas**: "quanto gastei no mês?", "saldo atual", "extrato da semana"
- 🏷️ **Categorias Automáticas**: mercado, ifood, uber → Alimentação; luz, agua → Contas
- 💳 **Cartão de Crédito**: controle separado do fluxo de caixa

## Instalação Local

```bash
npm install
cp .env.example .env
# Edite .env com suas variáveis
npm start
```

## Deploy no Render (Grátis)

1. Crie conta em https://render.com
2. New Web Service → Conecte seu GitHub
3. Build: `npm install`
4. Start: `npm start`
5. Adicione as variáveis de ambiente do `.env`

## Variáveis de Ambiente

```
DATABASE_URL=/path/para/banco.db
WEBHOOK_SECRET=sua-chave-secreta
```

## Comandos

| Mensagem | Resposta |
|----------|----------|
| "gastei 100 no mercado" | Lança gasto de R$ 100 em Alimentação |
| "recebi 500 do salario" | Lança receita de R$ 500 |
| "quanto gastei no mes?" | Total gasto no mês |
| "saldo atual" | Saldo disponível |
| "extrato" | Últimos lançamentos |
