# Configuracao do Cloudflared como servico no Windows
# Execute este script como administrador

Write-Host "===== Configurando Cloudflared Tunnel como servico no Windows ====="

# Verificar se o Cloudflared esta instalado
try {
    $cloudflaredVersion = (& cloudflared --version) 2>$null
    Write-Host "Cloudflared encontrado"
} catch {
    Write-Host "Erro: Cloudflared nao esta instalado"
    Write-Host "Instale seguindo as instrucoes em: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
    exit 1
}

# Solicitar nome do tunel
$TUNNEL_NAME = Read-Host -Prompt "Nome do tunel Cloudflare (ex: print-tunnel)"

# Verificar se o tunel existe
$tunnelExists = cloudflared tunnel list | Select-String $TUNNEL_NAME
if (-not $tunnelExists) {
    Write-Host "Erro: Tunel '$TUNNEL_NAME' nao existe"
    Write-Host "Crie o tunel primeiro com: cloudflared tunnel create $TUNNEL_NAME"
    exit 1
}

# Caminho para executavel do Cloudflared
$CLOUDFLARED_PATH = (Get-Command cloudflared).Path

# Criar e instalar o serviço Windows
Write-Host "Criando serviço Windows para o túnel $TUNNEL_NAME..."

# Remover serviço existente, se houver
sc.exe delete "CloudflaredTunnel_$TUNNEL_NAME" | Out-Null

# Criar novo serviço
$serviceResult = sc.exe create "CloudflaredTunnel_$TUNNEL_NAME" binPath= "$CLOUDFLARED_PATH tunnel run $TUNNEL_NAME" start= auto displayname= "Cloudflare Tunnel - $TUNNEL_NAME" 
Write-Host "Serviço criado: CloudflaredTunnel_$TUNNEL_NAME"

# Iniciar o serviço
Start-Service -Name "CloudflaredTunnel_$TUNNEL_NAME"
Write-Host "Serviço iniciado"

# Verificar status
$serviceStatus = Get-Service -Name "CloudflaredTunnel_$TUNNEL_NAME" | Select-Object -ExpandProperty Status
Write-Host "Status do serviço: $serviceStatus"

Write-Host ""
Write-Host "===== Cloudflared configurado como serviço no Windows ====="
Write-Host "Para verificar status use: Get-Service -Name CloudflaredTunnel_$TUNNEL_NAME"
Write-Host "Para reiniciar use: Restart-Service -Name CloudflaredTunnel_$TUNNEL_NAME"
Write-Host "Para ver logs: acesse Event Viewer > Windows Logs > Application"