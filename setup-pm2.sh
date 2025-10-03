#!/bin/bash

# Script de configuração PM2 para servidor e agente de impressão
# Coloque este script na raiz do projeto e execute com:
# bash setup-pm2.sh

echo "===== Configurando PM2 para serviços de impressão ====="

# Diretório atual (raiz do projeto)
PROJECT_DIR=$(pwd)
echo "Diretório do projeto: $PROJECT_DIR"

# Garantir que o diretório de logs existe
mkdir -p "$PROJECT_DIR/logs"
echo "Diretório de logs criado"

# Verificar se o PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "PM2 não encontrado, instalando globalmente..."
    npm install -g pm2
else
    echo "PM2 já instalado"
fi

# Instalar dependências do projeto (se ainda não instaladas)
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "Instalando dependências do projeto..."
    npm install
else
    echo "Dependências do projeto já instaladas"
fi

# Parar qualquer instância anterior
echo "Parando serviços existentes..."
pm2 stop all &>/dev/null

# Iniciar os serviços usando o arquivo ecosystem.config.js
echo "Iniciando serviços com PM2..."
pm2 start ecosystem.config.js

# Salvar a configuração atual do PM2
echo "Salvando configuração do PM2..."
pm2 save

# Configurar o PM2 para iniciar no boot
echo "Configurando PM2 para iniciar com o sistema..."
pm2 startup

echo ""
echo "====== IMPORTANTE: PRÓXIMOS PASSOS ======"
echo "1. Execute o comando acima gerado pelo 'pm2 startup' (se solicitado)"
echo "2. Verifique o status com: pm2 status"
echo "3. Veja os logs com: pm2 logs"
echo ""
echo "Para editar as configurações:"
echo "- Edite o arquivo ecosystem.config.js"
echo "- Execute: pm2 reload ecosystem.config.js"
echo ""
echo "Configuração PM2 concluída!"