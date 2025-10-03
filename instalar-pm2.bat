@echo off
echo Executando script de configuracao do PM2 (Windows)...
PowerShell -ExecutionPolicy Bypass -File "%~dp0setup-pm2-windows.ps1"
echo.
echo Se nao houver erros acima, a configuracao foi concluida com sucesso.
echo.
pause