@echo off
color 0E
title Teste PM2 passo-a-passo

echo.
echo ===== TESTE PASSO A PASSO DO PM2 =====
echo.
echo Este script vai testar cada etapa para identificar o problema
echo.
pause

REM Parar processos anteriores
echo.
echo [ETAPA 1] Parando processos PM2 existentes...
pm2 stop all
pm2 delete all
echo.
echo Resultado da etapa 1:
pm2 status
echo.
pause

REM Teste básico - Node
echo.
echo [ETAPA 2] Testando versao Node.js...
node --version
echo.
echo Se nao apareceu versao acima, pode ser problema de instalacao do Node
echo.
pause

REM Teste script server.js
echo.
echo [ETAPA 3] Testando servidor diretamente com Node...
echo (Vai abrir em outra janela, feche-a após o teste)
echo.
start cmd /k "node src\server.js"
timeout /t 5
echo.
echo Se o servidor nao iniciou ou deu erro, verifique src\server.js
echo.
pause

REM Teste PM2 simples
echo.
echo [ETAPA 4] Testando PM2 com script simples...
cd src
pm2 start server.js --name teste-server
echo.
echo Resultado da etapa 4:
pm2 status
echo.
pause

REM Conclusão
echo.
echo ===== Conclusao =====
echo.
echo Baseado nos resultados acima:
echo.
echo 1. Se todas as etapas funcionaram: Use o script instalar-pm2-absoluto.bat
echo 2. Se a etapa 2 falhou: Reinstale o Node.js
echo 3. Se a etapa 3 falhou: Corrija erros em server.js
echo 4. Se somente etapa 4 falhou: Reinstale o PM2 (npm install -g pm2)
echo.
echo O que fazer agora?
echo - Resolva o problema identificado
echo - Execute instalar-pm2-absoluto.bat como administrador
echo.
pause