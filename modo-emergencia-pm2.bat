@echo off
title PM2 - Modo Debug Especial
color 1F

echo.
echo =====================================================
echo  PM2 - INSTALACAO EM MODO EMERGENCIA (COM DEBUG)
echo =====================================================
echo.
echo Este script usa tecnicas especiais para resolver problemas
echo de inicializacao do PM2 em ambientes Windows problematicos.
echo.
echo Importante: execute como administrador!
echo.
pause

REM Matar processos que podem causar bloqueio
echo.
echo [1/10] Matando processos relacionados...
taskkill /F /IM pm2.exe /T 2>NUL
taskkill /F /IM pm2_bus.exe /T 2>NUL
taskkill /F /IM WindowsNode.exe /T 2>NUL
echo Processos encerrados.

REM Backup e remoção de .pm2
echo.
echo [2/10] Removendo instalacao PM2 anterior...
rd /s /q "%USERPROFILE%\.pm2" 2>NUL
echo Pasta .pm2 removida.

REM Reinstalando PM2
echo.
echo [3/10] Reinstalando PM2 globalmente...
call npm uninstall -g pm2
call npm uninstall -g pm2-windows-startup
call npm cache clean --force
call npm install -g pm2
call npm install -g pm2-windows-startup
echo PM2 reinstalado.

REM Verificando ambiente Node.js
echo.
echo [4/10] Verificando ambiente Node.js...
node --version
echo.
if %errorlevel% neq 0 (
  echo ERRO CRITICO: Node.js nao encontrado! Reinstale o Node.js.
  pause
  exit /b
)

REM Criar pastas necessárias
echo.
echo [5/10] Preparando estrutura de pastas...
mkdir logs 2>NUL
echo.

REM Iniciar servidor
echo.
echo [6/10] Iniciando servidor com logs detalhados...
cd /d "%~dp0"
echo Pasta atual: %CD%
echo.
echo Tentando iniciar servidor...
call pm2 start "src\server.js" --name print-server --log "logs/print-server.log" --no-daemon
echo.
echo Verificando status...
call pm2 list
echo.
echo Se apareceu algum erro acima, anote para diagnostico.
echo.
pause

REM Iniciar agente
echo.
echo [7/10] Iniciando agente com logs detalhados...
echo.
echo Tentando iniciar agente...
call pm2 start "src\agent.js" --name print-agent --log "logs/print-agent.log" --no-daemon
echo.
echo Verificando status final...
call pm2 list
echo.
pause

REM Inicialização automática
echo.
echo [8/10] Configurando inicializacao automatica...
echo.
call pm2 save --force
call pm2-startup install
echo.

REM Verificação final
echo.
echo [9/10] Verificacao final de status...
call pm2 status
echo.

echo.
echo [10/10] Procedimento concluido!
echo.
echo Se os servicos aparecem na lista acima como "online",
echo a instalacao foi bem-sucedida!
echo.
echo Caso contrario, verifique os arquivos de log em:
echo %CD%\logs\
echo.
echo Proximos passos:
echo 1. Verifique os logs com: pm2 logs
echo 2. Reinicie o computador para testar o inicio automatico
echo.
pause