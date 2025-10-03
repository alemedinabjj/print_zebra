@echo off
color 0A
title Instalacao PM2 com caminhos absolutos
echo.
echo ===== Configuracao PM2 Simplificada - CAMINHO ABSOLUTO =====
echo.

REM Obter diretório atual
set PROJECT_DIR=%CD%
echo Diretorio do projeto: %PROJECT_DIR%

REM Criar diretório de logs se não existir
mkdir logs 2>nul
echo Diretorio de logs criado

REM Parar e excluir processos anteriores
echo Parando servicos antigos...
call pm2 stop all
call pm2 delete all

REM Iniciar servidor e agente com caminhos ABSOLUTOS
echo.
echo Iniciando servidor e agente com caminhos ABSOLUTOS...
echo.

REM Servidor principal
echo Iniciando print-server...
call pm2 start "%PROJECT_DIR%\src\server.js" --name print-server

REM Verificar se o servidor iniciou
if %errorlevel% neq 0 (
  echo.
  echo ERRO: Falha ao iniciar o servidor!
  echo.
  echo Tentando metodo alternativo...
  cd src
  call pm2 start server.js --name print-server
  cd ..
)

REM Agente local
echo.
echo Iniciando print-agent...
call pm2 start "%PROJECT_DIR%\src\agent.js" --name print-agent

REM Verificar se o agente iniciou
if %errorlevel% neq 0 (
  echo.
  echo ERRO: Falha ao iniciar o agente!
  echo.
  echo Tentando metodo alternativo...
  cd src
  call pm2 start agent.js --name print-agent
  cd ..
)

REM Configurar reinicialização automática
echo.
echo Configurando comportamento de reinicializacao...
call pm2 update

REM Salvar configuração
echo.
echo Salvando configuracao PM2...
call pm2 save

REM Configurar inicialização com Windows
echo.
echo Configurando PM2 para iniciar com o Windows...
call pm2-startup install

REM Status atual
echo.
echo ===== Servicos Configurados =====
call pm2 status
echo.
echo.
echo Se os servicos aparecem acima, a instalacao foi bem-sucedida!
echo.
echo Proximos passos:
echo 1. Verifique os logs com: pm2 logs
echo 2. Reinicie o computador para testar o inicio automatico
echo.
pause