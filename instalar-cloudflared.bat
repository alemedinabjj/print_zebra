@echo off
echo Executando script de configuracao do Cloudflared (Windows)...
PowerShell -ExecutionPolicy Bypass -File "%~dp0setup-cloudflared-service-windows.ps1"
echo.
echo Se nao houver erros acima, a configuracao foi concluida com sucesso.
echo.
pause