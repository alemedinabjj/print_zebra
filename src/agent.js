import { fastify } from 'fastify';
import cors from '@fastify/cors';
import printService from './services/print.js';

// Agente local de impressão via IP.
// Objetivo: receber requisições locais e enviar diretamente para impressora Zebra em rede (porta 9100),
// semelhante ao endpoint /print-from-url original (USB), porém usando socket IP.

const app = fastify({ logger: true });

app.register(cors, { origin: '*' });

app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try { done(null, JSON.parse(body)); } catch (err) { err.statusCode = 400; done(err); }
});

app.get('/health', async () => ({ status: 'ok', role: 'local-print-agent', timestamp: new Date().toISOString() }));

// Lista impressoras detectadas (combina pdf-to-printer ou fallback powershell)
app.get('/printers', async (request, reply) => {
  try {
    const printers = await printService.getAvailablePrinters();
    return { success: true, count: printers.length, printers };
  } catch (err) {
    request.log.error('Erro em /printers:', err);
    return reply.status(500).send({ success: false, error: 'Falha ao listar impressoras', details: err.message });
  }
});

// POST /print-from-url-ip
// Body: { pdfUrl: string, ip?: string, port?: number, printerName?: string, sharePath?: string }
// Se ip presente => envia via socket IP; caso contrário tenta spool usando printerName/sharePath (PDF -> teremos que converter? Aqui mantemos IP only; spool PDF já existe via rotas locais originais se necessário)
app.post('/print-from-url-ip', async (request, reply) => {
  try {
    const { pdfUrl, ip, port, printerName, sharePath } = request.body || {};
    const targetIp = ip || process.env.PRINTER_IP;
    let targetPort = port !== undefined ? parseInt(port, 10) : null;

    if (!pdfUrl) {
      return reply.status(400).send({ success: false, error: 'pdfUrl é obrigatório' });
    }
    try { new URL(pdfUrl); } catch { return reply.status(400).send({ success: false, error: 'pdfUrl inválida' }); }
    // Se IP fornecido -> modo IP
    if (targetIp) {
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(targetIp)) {
        return reply.status(400).send({ success: false, error: 'Formato de IP inválido' });
      }
      if (targetPort !== null && (isNaN(targetPort) || targetPort < 1 || targetPort > 65535)) {
        return reply.status(400).send({ success: false, error: 'Port inválida (1-65535)' });
      }
      if (printService.isPrinterBusy(targetIp)) {
        const state = printService.getPrinterState(targetIp);
        return reply.status(409).send({ success: false, error: 'Printer busy', state });
      }
      const result = await printService.printPdfFromUrlToIp(pdfUrl, targetIp, targetPort);
      return { success: true, mode: 'ip', message: 'Job enfileirado (PDF -> IP)', result, ip: targetIp, port: targetPort || parseInt(process.env.PRINTER_RAW_PORT, 10) || 9100 };
    }

    // Sem IP: orientar usar rota específica spool PDF (não implementada aqui) ou implementar futuro
    return reply.status(400).send({ success: false, error: 'Sem IP: rota atual não suporta PDF via spool ainda. Forneça ip ou implemente /print-pdf-shared.' });
  } catch (error) {
    request.log.error('Erro em /print-from-url-ip:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao processar impressão', details: error.message });
  }
});

// POST /print-zpl-ip
// Body: { zpl: string, ip?: string, port?: number, printerName?: string, sharePath?: string }
// Se ip -> envia socket; caso contrário usa spool compartilhado
app.post('/print-zpl-ip', async (request, reply) => {
  try {
    const { zpl, ip, port, printerName, sharePath } = request.body || {};
    const targetIp = ip || process.env.PRINTER_IP;
    let targetPort = port !== undefined ? parseInt(port, 10) : null;
    if (!zpl) {
      return reply.status(400).send({ success: false, error: 'zpl é obrigatório' });
    }
    if (targetIp) {
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(targetIp)) {
        return reply.status(400).send({ success: false, error: 'Formato de IP inválido' });
      }
      if (targetPort !== null && (isNaN(targetPort) || targetPort < 1 || targetPort > 65535)) {
        return reply.status(400).send({ success: false, error: 'Port inválida (1-65535)' });
      }
      if (printService.isPrinterBusy(targetIp)) {
        const state = printService.getPrinterState(targetIp);
        return reply.status(409).send({ success: false, error: 'Printer busy', state });
      }
      const result = await printService.printZplToIp(zpl, targetIp, targetPort);
      return { success: true, mode: 'ip', message: 'Job enfileirado (ZPL -> IP)', result, ip: targetIp, port: targetPort || parseInt(process.env.PRINTER_RAW_PORT, 10) || 9100 };
    }

    // Modo compartilhado (spool)
    if (!printerName && !sharePath) {
      return reply.status(400).send({ success: false, error: 'Forneça ip OU printerName/sharePath para impressão compartilhada' });
    }
    const key = printerName || sharePath;
    if (this?.printService?.isPrinterBusy && printService.isPrinterBusy(key)) {
      const state = printService.getPrinterState(key);
      return reply.status(409).send({ success: false, error: 'Printer busy', state });
    }
    const result = await printService.printZplShared(zpl, { printerName, sharePath });
    return { success: true, mode: 'shared', message: 'Job enfileirado (ZPL -> Spool)', result, printerName, sharePath };
  } catch (error) {
    request.log.error('Erro em /print-zpl-ip:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao processar ZPL', details: error.message });
  }
});

// POST /print-pdf-shared
// Body: { pdfUrl: string, printerName?: string, sharePath?: string }
// Faz download e envia para spool (USB compartilhada / CUPS)
// Autenticação básica opcional para /print-pdf-shared via header x-api-key
// Defina PRINT_API_KEY no ambiente para ativar. Se não definido, rota permanece aberta.
app.post('/print-pdf-shared', async (request, reply) => {
  if (process.env.PRINT_API_KEY) {
    const provided = request.headers['x-api-key'];
    if (!provided) {
      return reply.status(401).send({ success: false, error: 'missing_api_key', message: 'Header x-api-key ausente' });
    }
    if (provided !== process.env.PRINT_API_KEY) {
      return reply.status(403).send({ success: false, error: 'invalid_api_key', message: 'x-api-key inválida' });
    }
  }
  try {
    const { pdfUrl, printerName, sharePath } = request.body || {};
    if (!pdfUrl) {
      return reply.status(400).send({ success: false, error: 'pdfUrl é obrigatório' });
    }
    try { new URL(pdfUrl); } catch { return reply.status(400).send({ success: false, error: 'pdfUrl inválida' }); }
    if (!printerName && !sharePath) {
      return reply.status(400).send({ success: false, error: 'Forneça printerName ou sharePath' });
    }
    const key = printerName || sharePath;
    if (printService.isPrinterBusy(key)) {
      const state = printService.getPrinterState(key);
      return reply.status(409).send({ success: false, error: 'Printer busy', state });
    }
    const result = await printService.printPdfSharedFromUrl(pdfUrl, { printerName, sharePath });
    return { success: true, mode: 'pdf-shared', message: 'Job enfileirado (PDF -> Spool)', result, printerName, sharePath };
  } catch (error) {
    request.log.error('Erro em /print-pdf-shared:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao processar PDF compartilhado', details: error.message });
  }
});

// Simple status consulta estados registrados (pelo IP)
app.get('/printer-ip-status', async (request, reply) => {
  try {
    const { ip, printerName, sharePath } = request.query || {};
    if (!ip && !printerName && !sharePath) {
      return { success: true, states: printService.getAllPrinterStates() };
    }
    const key = ip || printerName || sharePath;
    let state = printService.getPrinterState(key);
    if (state.status === 'unknown' && printerName) {
      // tentar detectar e inicializar
      state = await printService.getOrInitPrinterState(printerName);
    }
    return { success: true, key, state };
  } catch (error) {
    request.log.error('Erro em /printer-ip-status:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao obter estado', details: error.message });
  }
});

// GET /printer-ip-check?ip=..&port=..
// Testa conectividade TCP rápida (sem enviar dados) para diagnosticar ECONNREFUSED / timeout
app.get('/printer-ip-check', async (request, reply) => {
  try {
    const { ip, port } = request.query || {};
    const targetIp = ip || process.env.PRINTER_IP;
    let targetPort = port !== undefined ? parseInt(port, 10) : null;
    if (!targetIp) {
      return reply.status(400).send({ success: false, error: 'IP não fornecido (param ip ou PRINTER_IP)' });
    }
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(targetIp)) {
      return reply.status(400).send({ success: false, error: 'Formato de IP inválido' });
    }
    if (targetPort !== null && (isNaN(targetPort) || targetPort < 1 || targetPort > 65535)) {
      return reply.status(400).send({ success: false, error: 'Port inválida (1-65535)' });
    }
    const result = await printService.testPrinterConnectivity(targetIp, targetPort);
    // Acrescentar estado conhecido (último sucesso/erro)
    const state = printService.getPrinterState(targetIp);
    return { success: true, check: result, state };
  } catch (error) {
    request.log.error('Erro em /printer-ip-check:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao testar conectividade', details: error.message });
  }
});

const start = async () => {
  try {
    const port = parseInt(process.env.AGENT_PORT, 10) || 2323;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Local Print Agent rodando em http://0.0.0.0:${port}`);
    if (process.env.PRINTER_IP) {
      console.log(`Impressora alvo padrão (PRINTER_IP): ${process.env.PRINTER_IP}`);
    }
    
    // Enviar sinal 'ready' para o PM2
    if (process.send) {
      process.send('ready');
      console.log('Sinal PM2 ready enviado');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;