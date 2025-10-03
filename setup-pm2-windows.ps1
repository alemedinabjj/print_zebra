# Configuração de PM2 para Windows
# Execute este script como administrador

# Diretório atual (raiz do projeto)
$PROJECT_DIR = $PWD.Path
Write-Host "===== Configurando PM2 para serviços de impressão (Windows) ====="
Write-Host "Diretório do projeto: $PROJECT_DIR"

# Garantir que o diretório de logs existe
New-Item -ItemType Directory -Path "$PROJECT_DIR\logs" -Force | Out-Null
Write-Host "Diretório de logs criado"

# Verificar se o PM2 está instalado
try {
    $pm2Version = (& pm2 --version) 2>$null
    Write-Host "PM2 já instalado (versão $pm2Version)"
} catch {
    Write-Host "PM2 não encontrado, instalando globalmente..."
    npm install -g pm2
    npm install -g pm2-windows-startup
}

# Instalar dependências do projeto (se ainda não instaladas)
if (-not (Test-Path "$PROJECT_DIR\node_modules")) {
    Write-Host "Instalando dependências do projeto..."
    npm install
} else {
    Write-Host "Dependências do projeto já instaladas"
}

# Parar qualquer instância anterior
Write-Host "Parando serviços existentes..."
pm2 stop all

# Iniciar os serviços usando o arquivo ecosystem.config.js
Write-Host "Iniciando serviços com PM2..."
pm2 start ecosystem.config.js

# Salvar a configuração atual do PM2
Write-Host "Salvando configuração do PM2..."
pm2 save

# Configurar o PM2 para iniciar no boot (Windows)
Write-Host "Configurando PM2 para iniciar com o Windows..."
pm2-startup install

Write-Host ""
Write-Host "====== IMPORTANTE: PRÓXIMOS PASSOS ======"
Write-Host "1. Verifique o status com: pm2 status"
Write-Host "2. Veja os logs com: pm2 logs"
Write-Host ""
Write-Host "Para editar as configurações:"
Write-Host "- Edite o arquivo ecosystem.config.js"
Write-Host "- Execute: pm2 reload ecosystem.config.js"
Write-Host ""
Write-Host "Configuração PM2 concluída!"