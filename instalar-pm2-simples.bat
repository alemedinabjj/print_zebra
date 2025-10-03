@echo off
echo.
echo ===== Script Simplificado para Configurar PM2 no Windows =====
echo.
echo Este script deve ser executado como Administrador.
echo.

REM Mata processos existentes do PM2/Node que possam estar travados
echo Matando processos PM2/Node existentes...
taskkill /F /IM pm2.exe /T 2>nul
taskkill /F /IM node.exe /T 2>nul
timeout /t 3 /nobreak >nul

REM Limpa instalação anterior do PM2
echo Limpando instalacao anterior do PM2...
rd /s /q "%USERPROFILE%\.pm2" 2>nul
timeout /t 1 /nobreak >nul

REM Reinstala o PM2
echo Reinstalando PM2 globalmente...
call npm install -g pm2
call npm install -g pm2-windows-startup
timeout /t 2 /nobreak >nul

REM Configura startup
echo Configurando PM2 startup...
call pm2-startup install
timeout /t 2 /nobreak >nul

REM Inicia servidor e agente
echo Iniciando servidor e agente...
cd /d "%~dp0"
call pm2 start src\server.js --name print-server
call pm2 start src\agent.js --name print-agent
timeout /t 2 /nobreak >nul

REM Salva configuração
echo Salvando configuracao...
call pm2 save
timeout /t 2 /nobreak >nul

echo.
echo ===== INSTALACAO CONCLUIDA =====
echo.
echo Para verificar status: pm2 status
echo Para ver logs: pm2 logs
echo.
pause