import { fastify  } from 'fastify';
import cors from '@fastify/cors';
import printService from './services/print.js';
import axios from 'axios';

const app = fastify({
  logger: true
});



app.register(cors, {
  origin: '*',
});

app.register(import('@fastify/multipart'), {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

app.get('/', async (request, reply) => {
  return { message: 'Hello, World!' };
});

app.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.get('/printers', async (request, reply) => {
  try {
    const printers = await printService.getAvailablePrinters();
    return { success: true, printers };
  } catch (error) {
    app.log.error('Error getting printers:', error);
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get printer list',
      details: error.message 
    });
  }
});

app.get('/printer-status', async (request, reply) => {
  try {
    const printerName = request.query.printer || null;
    
    if (printerName) {
      const state = printService.getPrinterState(printerName);
      return {
        success: true,
        printer: printerName,
        state
      };
    } else {
      const printerStates = printService.getAllPrinterStates();
      
      const allPrinters = await printService.getAvailablePrinters();
      
      return {
        success: true,
        printerStates,
        availablePrinters: allPrinters.map(p => ({
          name: p.name,
          status: printerStates[p.name]?.status || 'unknown'
        }))
      };
    }
  } catch (error) {
    app.log.error('Error getting printer status:', error);
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get printer status',
      details: error.message 
    });
  }
});

app.get('/test-pdf-to-printer', async (request, reply) => {
  try {
    const pdfToPrinter = await import('pdf-to-printer');
    
    const functions = Object.keys(pdfToPrinter);
    
    let printers = [];
    let error = null;
    
    try {
      if (typeof pdfToPrinter.getPrinters === 'function') {
        printers = await pdfToPrinter.getPrinters();
      } else {
        error = 'getPrinters não é uma função';
      }
    } catch (err) {
      error = err.message;
    }
    
    return {
      success: true,
      moduleInfo: {
        functions,
        hasGetPrinters: typeof pdfToPrinter.getPrinters === 'function',
        hasPrint: typeof pdfToPrinter.print === 'function',
      },
      printersResult: {
        success: !error,
        error,
        printers
      }
    };
  } catch (error) {
    app.log.error('Erro ao testar pdf-to-printer:', error);
    return reply.status(500).send({
      success: false,
      error: 'Falha ao testar pdf-to-printer',
      details: error.message
    });
  }
});

app.get('/zd220-printer', async (request, reply) => {
  try {
    const allPrinters = await printService.getAvailablePrinters();
    
    const zd220Printer = allPrinters.find(p => 
      p?.name?.includes('ZDesigner ZD220') || 
      p?.name?.includes('ZD220')
    );
    
    if (zd220Printer) {
      return { 
        success: true, 
        printer: zd220Printer,
        message: `Impressora ZD220 encontrada: ${zd220Printer.name}`
      };
    }
    
    return reply.status(404).send({
      success: false,
      error: 'Impressora ZD220 não encontrada',
      availablePrinters: allPrinters.map(p => ({ 
        name: p?.name || 'Unnamed'
      }))
    });
  } catch (error) {
    app.log.error('Error finding ZD220 printer:', error);
    return reply.status(500).send({
      success: false,
      error: 'Falha ao procurar impressora ZD220',
      details: error.message
    });
  }
});

app.post('/print-zd220', async (request, reply) => {
  try {
    const { pdfUrl } = request.body;
    
    if (!pdfUrl) {
      return reply.status(400).send({
        success: false,
        error: 'URL do PDF não fornecida'
      });
    }
    
    const allPrinters = await printService.getAvailablePrinters();
    
    const zd220Printer = allPrinters.find(p => 
      p?.name?.includes('ZDesigner ZD220') || 
      p?.name?.includes('ZD220')
    );
    
    if (!zd220Printer) {
      return reply.status(404).send({
        success: false,
        error: 'Impressora ZD220 não encontrada',
        availablePrinters: allPrinters.map(p => p?.name || 'Unnamed')
      });
    }
    
    const result = await printService.printPdfFromUrl(pdfUrl, zd220Printer.name);
    
    return {
      success: true,
      message: `PDF enviado para impressora ${zd220Printer.name}`,
      result
    };
    
  } catch (error) {
    app.log.error('Erro ao imprimir na ZD220:', error);
    return reply.status(500).send({
      success: false,
      error: 'Falha ao imprimir na ZD220',
      details: error.message
    });
  }
});

app.get('/zebra-printer', async (request, reply) => {
  try {
    console.log('Buscando todas as impressoras disponíveis...');
    const allPrinters = await printService.getAvailablePrinters();
    console.log(`Total de impressoras disponíveis: ${allPrinters.length}`);
    
    console.log('Procurando por impressora Zebra...');
    const zebraPrinter = await printService.findZebraPrinter();
    
    if (zebraPrinter) {
      console.log(`Impressora Zebra encontrada: ${zebraPrinter.name}`);
      return { 
        success: true, 
        printer: zebraPrinter,
        message: `Impressora Zebra encontrada: ${zebraPrinter.name}`
      };
    }
    
    console.log('Nenhuma impressora Zebra encontrada mesmo após verificar padrões comuns.');
    
    const potentialZebraPrinters = allPrinters.filter(p => {
      const name = p?.name?.toLowerCase() || '';
      return name.includes('zdesigner') || 
             name.includes('zd') || 
             name.includes('zebra') ||
             name.includes('zpl');
    });
    
    return reply.status(200).send({ 
      success: false, 
      error: 'Zebra printer not found',
      potentialZebraPrinters: potentialZebraPrinters.length > 0 ? potentialZebraPrinters : 'Nenhuma encontrada',
      availablePrinters: allPrinters.map(p => ({ 
        name: p?.name || 'Unnamed', 
        displayName: p?.displayName || 'No Display Name'
      }))
    });
  } catch (error) {
    app.log.error('Error finding Zebra printer:', error);
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to find Zebra printer',
      details: error.message 
    });
  }
});

app.post('/print', async (request, reply) => {
  try {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    if (!data.mimetype.includes('pdf')) {
      return reply.status(400).send({ 
        success: false, 
        error: 'Only PDF files are supported' 
      });
    }

    const printerName = request.query.printer || null;
    
    const fileBuffer = await data.toBuffer();
    
    const result = await printService.printPdf(fileBuffer, printerName);
    
    return { 
      success: true, 
      message: 'Print job submitted successfully',
      result 
    };
    
  } catch (error) {
    app.log.error('Error printing file:', error);
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to print file',
      details: error.message 
    });
  }
});

app.post('/print-from-url', async (request, reply) => {
  try {
    const { pdfUrl } = request.body;
    
    if (!pdfUrl) {
      return reply.status(400).send({ 
        success: false, 
        error: 'No PDF URL provided' 
      });
    }

    try {
      new URL(pdfUrl);
    } catch (e) {
      return reply.status(400).send({ 
        success: false, 
        error: 'Invalid URL format' 
      });
    }

    const printerName = request.query.printer || null;
    
    // Verificar se a impressora solicitada já está ocupada
    if (printerName && printService.isPrinterBusy(printerName)) {
      const printerState = printService.getPrinterState(printerName);
      return reply.status(409).send({  // 409 Conflict - recurso ocupado
        success: false,
        error: 'Printer is busy',
        printerState,
        message: `A impressora ${printerName} está ocupada: ${printerState.message}`
      });
    }
    
    // Definir um timeout para toda a operação
    const printPromise = printService.printPdfFromUrl(pdfUrl, printerName);
    
    // Timeout global para a operação de impressão (3 minutos)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operação de impressão excedeu o tempo limite de 3 minutos')), 
        3 * 60 * 1000);
    });
    
    // Usar Promise.race para aplicar o timeout
    const result = await Promise.race([printPromise, timeoutPromise]);
    
    // Se a impressão foi bem sucedida, atualizamos o status da etiqueta
    if (result.success) {
      try {
        // Chamada ao endpoint AWS para atualização usando axios com timeout
        const updateResponse = await axios.post(
          'https://a7dlltxg6a.execute-api.us-east-2.amazonaws.com/dev/update-etiqueta-producao',
          {
            pdfUrl,
            printStatus: 'completed',
            timestamp: new Date().toISOString(),
            printerName: result.printerName || printerName || 'default',
            jobId: result.jobId
          },
          {
            timeout: 10000 // 10 segundos de timeout para a chamada API
          }
        );
        
        app.log.info(`Etiqueta status update result: ${updateResponse.status}`);
        
        return { 
          success: true, 
          message: 'Print job from URL submitted successfully',
          result,
          etiquetaUpdate: {
            success: updateResponse.status >= 200 && updateResponse.status < 300,
            statusCode: updateResponse.status,
            result: updateResponse.data
          }
        };
      } catch (updateError) {
        app.log.warn('Failed to update etiqueta status:', updateError);
        return { 
          success: true, 
          message: 'Print job from URL submitted successfully, but etiqueta status update failed',
          result,
          etiquetaUpdate: {
            success: false,
            error: updateError.message
          }
        };
      }
    }
    
    return { 
      success: true, 
      message: 'Print job from URL submitted successfully',
      result 
    };
    
  } catch (error) {
    // Verificar se o erro é porque a impressora está ocupada
    if (error.message && error.message.includes('está ocupada')) {
      app.log.warn(`Impressora ocupada: ${error.message}`);
      return reply.status(409).send({  // 409 Conflict - recurso ocupado
        success: false,
        error: 'Printer is busy',
        message: error.message
      });
    }
    
    app.log.error('Error printing file from URL:', error);
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to print file from URL',
      details: error.message 
    });
  }
});

// ================= Rota de Impressão Direta via IP =================
// Body pode conter:
// { ip: '192.168.15.249', zpl: '^XA...^XZ' }
// ou { ip: '192.168.15.249', pdfUrl: 'http://...' }
// Campo opcional: type: 'zpl' | 'pdf' (inferido se ausente)
app.post('/print-ip', async (request, reply) => {
  try {
    const { ip, zpl, pdfUrl, type } = request.body || {};
    if (!ip) {
      return reply.status(400).send({ success: false, error: 'IP da impressora é obrigatório' });
    }

    // Validação básica de IP (IPv4 simples)
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
      return reply.status(400).send({ success: false, error: 'Formato de IP inválido' });
    }

    const mode = type || (zpl ? 'zpl' : pdfUrl ? 'pdf' : null);
    if (!mode) {
      return reply.status(400).send({ success: false, error: 'Informe zpl ou pdfUrl' });
    }

    // Verificar se já existe job IP em andamento para esse host
    if (printService.isPrinterBusy(ip)) {
      const state = printService.getPrinterState(ip);
      return reply.status(409).send({
        success: false,
        error: 'Printer IP busy',
        state,
        message: `Impressora IP ${ip} ocupada: ${state.message}`
      });
    }

    let result;
    if (mode === 'zpl') {
      if (!zpl) {
        return reply.status(400).send({ success: false, error: 'Campo zpl é obrigatório para type=zpl' });
      }
      result = await printService.printZplToIp(zpl, ip);
    } else if (mode === 'pdf') {
      if (!pdfUrl) {
        return reply.status(400).send({ success: false, error: 'Campo pdfUrl é obrigatório para type=pdf' });
      }
      try { new URL(pdfUrl); } catch { return reply.status(400).send({ success: false, error: 'pdfUrl inválida' }); }
      result = await printService.printPdfFromUrlToIp(pdfUrl, ip);
    } else {
      return reply.status(400).send({ success: false, error: 'Tipo desconhecido' });
    }

    return {
      success: true,
      message: 'Job de impressão IP enfileirado',
      result,
      ip,
      mode
    };
  } catch (error) {
    request.log.error('Erro em /print-ip:', error);
    return reply.status(500).send({ success: false, error: 'Falha ao processar impressão por IP', details: error.message });
  }
});

// Endpoint de atualização de etiqueta removido, agora usando o endpoint AWS

const start = async () => {
  try {
    const port = parseInt(process.env.PORT, 10) || 3333;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running at http://0.0.0.0:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;