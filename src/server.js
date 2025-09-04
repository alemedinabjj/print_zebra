import { fastify  } from 'fastify';
import cors from '@fastify/cors';
import printService from './services/print.js';

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

// Endpoint para testar o funcionamento básico da biblioteca de impressão
app.get('/test-pdf-to-printer', async (request, reply) => {
  try {
    // Importar diretamente para testar
    const pdfToPrinter = await import('pdf-to-printer');
    
    // Verificar se as funções existem
    const functions = Object.keys(pdfToPrinter);
    
    // Tentar obter impressoras diretamente
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

app.get('/zebra-printer', async (request, reply) => {
  try {
    // Buscar todas as impressoras primeiro para logs
    console.log('Buscando todas as impressoras disponíveis...');
    const allPrinters = await printService.getAvailablePrinters();
    console.log(`Total de impressoras disponíveis: ${allPrinters.length}`);
    
    // Buscar impressora Zebra
    console.log('Procurando por impressora Zebra...');
    const zebraPrinter = await printService.findZebraPrinter();
    
    if (zebraPrinter) {
      console.log(`Impressora Zebra encontrada: ${zebraPrinter.name}`);
      return { 
        success: true, 
        printer: zebraPrinter 
      };
    }
    
    console.log('Nenhuma impressora Zebra encontrada.');
    // Retornamos mais informação no erro para debug
    return reply.status(404).send({ 
      success: false, 
      error: 'Zebra printer not found',
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
    
    const result = await printService.printPdfFromUrl(pdfUrl, printerName);
    
    return { 
      success: true, 
      message: 'Print job from URL submitted successfully',
      result 
    };
    
  } catch (error) {
    app.log.error('Error printing file from URL:', error);
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to print file from URL',
      details: error.message 
    });
  }
});

const start = async () => {
  try {
    await app.listen({ port: 3333, host: '0.0.0.0' });
    console.log('Server running at http://0.0.0.0:3333');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;