@echo off
echo.
echo ===== Script direto para PM2 - Sem arquivo de configuracao =====
echo.
echo Este script deve ser executado como Administrador.
echo.

REM Verificar se PM2 está instalado
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
  echo Instalando PM2...
  call npm install -g pm2
  call npm install -g pm2-windows-startup
) else (
  echo PM2 ja instalado
)

REM Criar diretório de logs
mkdir logs 2>nul
echo Diretorio de logs criado

REM Parar processos anteriores
echo Parando servicos existentes...
call pm2 stop all
call pm2 delete all

REM Iniciar servidor e agente diretamente
echo Iniciando servidor e agente...
call pm2 start src\server.js --name print-server ^
  --log-date-format "YYYY-MM-DD HH:mm:ss Z" ^
  --error logs/print-server-error.log ^
  --output logs/print-server-out.log ^
  --max-memory-restart 500M ^
  --restart-delay 5000 ^
  --env PORT=3333 ^
  -- NODE_ENV=production

call pm2 start src\agent.js --name print-agent ^
  --log-date-format "YYYY-MM-DD HH:mm:ss Z" ^
  --error logs/print-agent-error.log ^
  --output logs/print-agent-out.log ^
  --max-memory-restart 300M ^
  --restart-delay 5000 ^
  --env AGENT_PORT=2323 ^
  -- NODE_ENV=production

REM Salvar para início automático
echo Salvando configuracao...
call pm2 save

REM Configurar início automático no Windows
echo Configurando inicio automatico...
call pm2-startup install

echo.
echo ===== SERVICOS INICIADOS =====
echo.
echo Verificando status:
call pm2 status
echo.
echo.
pause