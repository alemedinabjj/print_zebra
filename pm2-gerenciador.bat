@echo off
title Gerenciador PM2 - Servidor de Impressao
color 0A

:menu
cls
echo ========================================
echo    GERENCIADOR PM2 - IMPRESSAO ZEBRA
echo ========================================
echo.
echo  1. Ver status dos servicos
echo  2. Ver logs do servidor
echo  3. Ver logs do agente
echo  4. Reiniciar servidor
echo  5. Reiniciar agente
echo  6. Reiniciar todos os servicos
echo  7. Parar todos os servicos
echo  8. Iniciar todos os servicos
echo  9. Resolver erro EPERM (executar como admin)
echo  0. Sair
echo.
echo ========================================

set /p op=Digite sua opcao: 

if "%op%"=="1" goto status
if "%op%"=="2" goto logs_server
if "%op%"=="3" goto logs_agent
if "%op%"=="4" goto restart_server
if "%op%"=="5" goto restart_agent
if "%op%"=="6" goto restart_all
if "%op%"=="7" goto stop_all
if "%op%"=="8" goto start_all
if "%op%"=="9" goto fix_eperm
if "%op%"=="0" goto end

echo Opcao invalida. Por favor, tente novamente.
timeout /t 2 >nul
goto menu

:status
cls
echo === Status dos Servicos ===
call pm2 status
echo.
pause
goto menu

:logs_server
cls
echo === Logs do Servidor ===
echo (Pressione Ctrl+C para voltar ao menu)
call pm2 logs print-server
goto menu

:logs_agent
cls
echo === Logs do Agente ===
echo (Pressione Ctrl+C para voltar ao menu)
call pm2 logs print-agent
goto menu

:restart_server
cls
echo === Reiniciando Servidor ===
call pm2 restart print-server
echo.
echo Servidor reiniciado com sucesso!
timeout /t 2 >nul
goto menu

:restart_agent
cls
echo === Reiniciando Agente ===
call pm2 restart print-agent
echo.
echo Agente reiniciado com sucesso!
timeout /t 2 >nul
goto menu

:restart_all
cls
echo === Reiniciando Todos os Servicos ===
call pm2 restart all
echo.
echo Todos os servicos reiniciados com sucesso!
timeout /t 2 >nul
goto menu

:stop_all
cls
echo === Parando Todos os Servicos ===
call pm2 stop all
echo.
echo Todos os servicos parados com sucesso!
timeout /t 2 >nul
goto menu

:start_all
cls
echo === Iniciando Todos os Servicos ===
call pm2 start all
echo.
echo Todos os servicos iniciados com sucesso!
timeout /t 2 >nul
goto menu

:fix_eperm
cls
echo === Corrigindo Erro EPERM ===
echo Este processo vai encerrar todos os processos PM2 e Node
echo e reconstruir o ambiente PM2.
echo.
echo Por favor, tenha certeza que esta executando como Administrador.
echo.
set /p confirm=Deseja continuar? (S/N): 

if /i "%confirm%"=="S" (
  echo.
  echo Matando processos...
  taskkill /F /IM pm2.exe /T 2>nul
  taskkill /F /IM node.exe /T 2>nul
  
  echo Limpando diretorio .pm2...
  rd /s /q "%USERPROFILE%\.pm2" 2>nul
  
  echo Reinstalando PM2...
  call npm install -g pm2
  call npm install -g pm2-windows-startup
  
  echo Configurando PM2 startup...
  call pm2-startup install
  
  echo Reiniciando servicos...
  call pm2 start "%~dp0src\server.js" --name print-server
  call pm2 start "%~dp0src\agent.js" --name print-agent
  call pm2 save
  
  echo.
  echo Correcao finalizada!
) else (
  echo Operacao cancelada.
)

pause
goto menu

:end
echo Saindo...
timeout /t 1 >nul
exit