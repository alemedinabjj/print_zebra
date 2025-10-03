module.exports = {
  apps: [
    {
      name: "print-server",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3333
      },
      // Logs
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/print-server-error.log",
      out_file: "logs/print-server-out.log",
      merge_logs: true,
      // Restart configurações
      restart_delay: 5000, // 5 segundos entre restarts em caso de crash
      max_restarts: 10,    // Máximo de 10 tentativas em ciclo
      wait_ready: true,    // Esperar sinal "ready" do processo
      listen_timeout: 20000, // Aguardar até 20s para o servidor iniciar
    },
    {
      name: "print-agent",
      script: "src/agent.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        AGENT_PORT: 2323,
        // Defina as variáveis de ambiente necessárias para o agente aqui
        // PRINTER_IP: "192.168.0.50",
        // PRINTER_RAW_PORT: 9100,
        // PRINT_API_KEY: "sua-chave-api"
      },
      // Logs
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/print-agent-error.log",
      out_file: "logs/print-agent-out.log",
      merge_logs: true,
      // Restart configurações
      restart_delay: 5000,
      max_restarts: 10,
      wait_ready: true,
      listen_timeout: 20000,
    }
  ]
}