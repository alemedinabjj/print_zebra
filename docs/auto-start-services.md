# Documentação: Configuração de Serviços Automáticos

Este guia descreve como configurar o servidor de impressão, o agente local e o túnel Cloudflare para iniciar automaticamente com o sistema e reiniciar em caso de falhas.

## Conteúdo

1. [Configuração do PM2](#configuração-do-pm2)
   - [Linux/Mac](#linuxmac)
   - [Windows](#windows)
2. [Configuração do Cloudflared como serviço](#configuração-do-cloudflared-como-serviço)
   - [Linux](#linux)
   - [Windows](#windows-1)
3. [Monitoramento e Manutenção](#monitoramento-e-manutenção)
4. [Troubleshooting](#troubleshooting)

## Configuração do PM2

O PM2 é um gerenciador de processos para Node.js que mantém suas aplicações funcionando 24/7, reiniciando-as automaticamente em caso de falhas.

### Linux/Mac

1. Navegue até o diretório do projeto:
   ```sh
   cd /caminho/para/print_zebra
   ```

2. Execute o script de configuração:
   ```sh
   chmod +x setup-pm2.sh
   ./setup-pm2.sh
   ```

3. Execute o comando gerado pelo PM2 se solicitado (geralmente começa com `sudo env PATH=...`)

### Windows

1. Abra PowerShell como administrador

2. Navegue até o diretório do projeto:
   ```powershell
   cd C:\caminho\para\print_zebra
   ```

3. Execute o script de configuração:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
   .\setup-pm2-windows.ps1
   ```

## Configuração do Cloudflared como serviço

### Linux

1. Certifique-se de que o túnel já foi criado:
   ```sh
   cloudflared tunnel list
   ```

2. Execute o script de configuração:
   ```sh
   chmod +x setup-cloudflared-service.sh
   ./setup-cloudflared-service.sh
   ```

3. Digite o nome do seu túnel quando solicitado.

### Windows

1. Certifique-se de que o túnel já foi criado:
   ```powershell
   cloudflared tunnel list
   ```

2. Execute o script de configuração como administrador:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
   .\setup-cloudflared-service-windows.ps1
   ```

3. Digite o nome do seu túnel quando solicitado.

## Monitoramento e Manutenção

### Gerenciando com PM2

- Ver status de todos os processos:
  ```
  pm2 status
  ```

- Ver logs em tempo real:
  ```
  pm2 logs
  ```

- Ver logs específicos:
  ```
  pm2 logs print-server
  pm2 logs print-agent
  ```

- Reiniciar processos:
  ```
  pm2 restart print-server
  pm2 restart print-agent
  ```

- Parar processos:
  ```
  pm2 stop print-server
  ```

- Iniciar processos:
  ```
  pm2 start print-server
  ```

- Recarregar configurações (após editar ecosystem.config.js):
  ```
  pm2 reload ecosystem.config.js
  ```

### Gerenciando o serviço Cloudflared

#### Linux:
```sh
sudo systemctl status cloudflared-nome-do-tunel
sudo systemctl restart cloudflared-nome-do-tunel
sudo systemctl stop cloudflared-nome-do-tunel
sudo journalctl -u cloudflared-nome-do-tunel -f
```

#### Windows:
```powershell
Get-Service -Name CloudflaredTunnel_nome-do-tunel
Restart-Service -Name CloudflaredTunnel_nome-do-tunel
Stop-Service -Name CloudflaredTunnel_nome-do-tunel
Start-Service -Name CloudflaredTunnel_nome-do-tunel
```

## Troubleshooting

### PM2

1. **Aplicação não inicia:**
   - Verifique os logs: `pm2 logs`
   - Verifique se as variáveis de ambiente estão corretas em ecosystem.config.js
   - Tente iniciar manualmente: `node src/server.js` ou `node src/agent.js`

2. **PM2 não inicia com o sistema:**
   - Linux: Execute `pm2 startup` novamente e siga as instruções
   - Windows: Reinstale com `pm2-startup install`
   - Salve estado atual: `pm2 save`

3. **Processos em loop de restart:**
   - Verifique os logs para identificar erros
   - Aumente o `restart_delay` no ecosystem.config.js
   - Verifique dependências e configuração de rede

### Cloudflared

1. **Serviço não inicia:**
   - Verifique se o config.yml está correto e no local adequado
   - Verifique se o tunnel ID existe: `cloudflared tunnel list`
   - Verifique permissões dos arquivos de credenciais

2. **Túnel conecta mas site não responde:**
   - Verifique se a aplicação local está rodando (PM2)
   - Verifique a configuração `ingress` em config.yml
   - Teste localmente: `curl http://localhost:3333/health`

3. **Erro "DNS record already exists":**
   - Use um nome de subdomínio diferente
   - Exclua o registro existente no dashboard da Cloudflare