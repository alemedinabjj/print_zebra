#!/bin/bash

# Script para configurar o Cloudflared como serviço
# Executa tanto o servidor de impressão quanto o túnel na inicialização

echo "===== Configurando Cloudflared Tunnel como serviço ====="

# Verificar se o Cloudflared está instalado
if ! command -v cloudflared &> /dev/null; then
    echo "Erro: Cloudflared não está instalado"
    echo "Instale seguindo as instruções em: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
    exit 1
fi

# Solicitar nome do túnel
read -p "Nome do túnel Cloudflare (ex: print-tunnel): " TUNNEL_NAME

# Verificar se o túnel existe
if ! cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo "Erro: Túnel '$TUNNEL_NAME' não existe"
    echo "Crie o túnel primeiro com: cloudflared tunnel create $TUNNEL_NAME"
    exit 1
fi

# Criar arquivo de serviço systemd
sudo bash -c "cat > /etc/systemd/system/cloudflared-$TUNNEL_NAME.service << EOF
[Unit]
Description=Cloudflare Tunnel for $TUNNEL_NAME
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
ExecStart=$(which cloudflared) tunnel run $TUNNEL_NAME
Restart=always
RestartSec=5
StartLimitInterval=60s
StartLimitBurst=3

[Install]
WantedBy=multi-user.target
EOF"

echo "Arquivo de serviço criado em /etc/systemd/system/cloudflared-$TUNNEL_NAME.service"

# Recarregar daemon systemd
sudo systemctl daemon-reload
echo "Daemon systemd recarregado"

# Habilitar e iniciar o serviço
sudo systemctl enable cloudflared-$TUNNEL_NAME.service
sudo systemctl start cloudflared-$TUNNEL_NAME.service
echo "Serviço cloudflared-$TUNNEL_NAME habilitado e iniciado"

# Verificar status
sudo systemctl status cloudflared-$TUNNEL_NAME.service

echo ""
echo "===== Cloudflared configurado como serviço ====="
echo "Comando para verificar status: sudo systemctl status cloudflared-$TUNNEL_NAME"
echo "Comando para reiniciar: sudo systemctl restart cloudflared-$TUNNEL_NAME"
echo "Comando para ver logs: sudo journalctl -u cloudflared-$TUNNEL_NAME -f"