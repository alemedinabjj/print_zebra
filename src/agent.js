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

// POST /print-from-url-ip
// Body: { pdfUrl: string, ip?: string, port?: number }
// Se ip ausente, usa PRINTER_IP do ambiente. Se port ausente, usa PRINTER_RAW_PORT ou 9100
app.post('/print-from-url-ip', async (request, reply) => {
  try {
    const { pdfUrl, ip, port } = request.body || {};
    const targetIp = ip || process.env.PRINTER_IP;
    let targetPort = port !== undefined ? parseInt(port, 10) : null;

    if (!pdfUrl) {
      return reply.status(400).send({ success: false, error: 'pdfUrl é obrigatório' });
    }
    try { new URL(pdfUrl); } catch { return reply.status(400).send({ success: false, error: 'pdfUrl inválida' }); }

    if (!targetIp) {
      return reply.status(400).send({ success: false, error: 'IP não fornecido (campo ip ou variável PRINTER_IP)' });
    }
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
    return { success: true, message: 'Job enfileirado (PDF -> IP)', result, ip: targetIp, port: targetPort || parseInt(process.env.PRINTER_RAW_PORT, 10) || 9100 };
  } catch (error) {
    request.log.error('Erro em /print-from-url-ip:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao processar impressão', details: error.message });
  }
});

// POST /print-zpl-ip
// Body: { zpl: string, ip?: string, port?: number }
app.post('/print-zpl-ip', async (request, reply) => {
  try {
    const { zpl, ip, port } = request.body || {};
    const targetIp = ip || process.env.PRINTER_IP;
    let targetPort = port !== undefined ? parseInt(port, 10) : null;
    if (!zpl) {
      return reply.status(400).send({ success: false, error: 'zpl é obrigatório' });
    }
    if (!targetIp) {
      return reply.status(400).send({ success: false, error: 'IP não fornecido (campo ip ou variável PRINTER_IP)' });
    }
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
    return { success: true, message: 'Job enfileirado (ZPL -> IP)', result, ip: targetIp, port: targetPort || parseInt(process.env.PRINTER_RAW_PORT, 10) || 9100 };
  } catch (error) {
    request.log.error('Erro em /print-zpl-ip:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao processar ZPL', details: error.message });
  }
});

// Simple status consulta estados registrados (pelo IP)
app.get('/printer-ip-status', async (request, reply) => {
  try {
    const { ip } = request.query || {};
    if (!ip) {
      return { success: true, states: printService.getAllPrinterStates() };
    }
    return { success: true, ip, state: printService.getPrinterState(ip) };
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
    const port = parseInt(process.env.AGENT_PORT, 10) || 4545;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Local Print Agent rodando em http://0.0.0.0:${port}`);
    if (process.env.PRINTER_IP) {
      console.log(`Impressora alvo padrão (PRINTER_IP): ${process.env.PRINTER_IP}`);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;