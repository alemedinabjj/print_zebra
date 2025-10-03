# Configuracao de PM2 # Instalar dependencias do projeto (se ainda nao instaladas)
if (-not (Test-Path "$PROJECT_DIR\node_modules")) {
    Write-Host "Instalando dependencias do projeto..."
    npm install
} else {
    Write-Host "Dependencias do projeto ja instaladas"
}

# Parar qualquer instancia anteriorows
# Execute este script como administrador

# Diretorio atual (raiz do projeto)
$PROJECT_DIR = $PWD.Path
Write-Host "===== Configurando PM2 para servicos de impressao (Windows) ====="
Write-Host "Diretorio do projeto: $PROJECT_DIR"

# Garantir que o diretorio de logs existe
New-Item -ItemType Directory -Path "$PROJECT_DIR\logs" -Force | Out-Null
Write-Host "Diretório de logs criado"

# Verificar se o PM2 esta instalado
try {
    $pm2Version = (& pm2 --version) 2>$null
    Write-Host "PM2 ja instalado (versao $pm2Version)"
} catch {
    Write-Host "PM2 nao encontrado, instalando globalmente..."
    npm install -g pm2
    npm install -g pm2-windows-startup
}

# Instalar dependencias do projeto (se ainda nao instaladas)
if (-not (Test-Path "$PROJECT_DIR\node_modules")) {
    Write-Host "Instalando dependências do projeto..."
    npm install
} else {
    Write-Host "Dependências do projeto já instaladas"
}

# Parar qualquer instancia anterior
Write-Host "Parando servicos existentes..."
pm2 stop all

# Iniciar os servicos usando o arquivo ecosystem.config.js
Write-Host "Iniciando servicos com PM2..."
pm2 start ecosystem.config.js

# Salvar a configuracao atual do PM2
Write-Host "Salvando configuracao do PM2..."
pm2 save

# Configurar o PM2 para iniciar no boot (Windows)
Write-Host "Configurando PM2 para iniciar com o Windows..."
pm2-startup install

Write-Host ""
Write-Host "====== IMPORTANTE: PROXIMOS PASSOS ======"
Write-Host "1. Verifique o status com: pm2 status"
Write-Host "2. Veja os logs com: pm2 logs"
Write-Host ""
Write-Host "Para editar as configuracoes:"
Write-Host "- Edite o arquivo ecosystem.config.js"
Write-Host "- Execute: pm2 reload ecosystem.config.js"
Write-Host ""
Write-Host "Configuracao PM2 concluida!"