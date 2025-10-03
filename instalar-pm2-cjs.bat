@echo off
echo.
echo ===== Script PM2 usando arquivo CJS (CommonJS) =====
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

REM Iniciar servidor e agente usando o arquivo CommonJS
echo Iniciando usando arquivo ecosystem.config.cjs...
call pm2 start ecosystem.config.cjs

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