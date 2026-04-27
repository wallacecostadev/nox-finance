#!/bin/bash
# Script para enviar o Nox Finance para o GitHub
# Execute no Git Bash com: bash subir-para-github.sh

echo "=== NOX FINANCE - Enviando para o GitHub ==="
echo ""

# Verifica se tem repositório remoto
if [ -z "$1" ]; then
    echo "ERRO: Você precisa informar seu usuário do GitHub"
    echo "Use: bash subir-para-github.sh SEU-USUARIO"
    echo ""
    echo "Exemplo: bash subir-para-github.sh joaosilva"
    exit 1
fi

USUARIO=$1
REPO="nox-finance"
REMOTE="https://github.com/${USUARIO}/${REPO}.git"

echo "Usuário: ${USUARIO}"
echo "Repositório: ${REPO}"
echo ""

# Verifica se já tem .git
if [ ! -d ".git" ]; then
    echo "1. Iniciando repositório Git..."
    git init
else
    echo "1. Repositório Git já existe."
fi

# Adiciona arquivos
echo "2. Adicionando arquivos..."
git add .

# Cria commit
echo "3. Criando commit..."
git commit -m "Nox Finance - versão inicial"

# Adiciona remote
echo "4. Configurando remote..."
git remote remove origin 2>/dev/null
git remote add origin ${REMOTE}

# Muda para main
echo "5. Mudando branch para main..."
git branch -M main

# Envia para o GitHub
echo "6. Enviando para o GitHub..."
echo "   (você precisará da sua senha ou token do GitHub)"
git push -u origin main

echo ""
echo "=== CONCLUÍDO! ==="
echo ""
echo "Agora acesse o Render.com e:"
echo "1. New + → Web Service"
echo "2. Connect GitHub → Selecione 'nox-finance'"
echo "3. Preencha:"
echo "   - Name: nox-finance"
echo "   - Region: Oregon"
echo "   - Branch: main"
echo "   - Build Command: npm install"
echo "   - Start Command: npm start"
echo "   - Instance: Free"
echo "4. Adicione as variáveis de ambiente:"
echo "   - DATABASE_PATH = ./nox-finance.db"
echo "   - WEBHOOK_SECRET = nox-secret-key-123"
echo "   - PORT = 3000"
echo ""
