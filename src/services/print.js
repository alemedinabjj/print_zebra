import pdfToPrinter from 'pdf-to-printer';
import fs from 'fs-extra';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';
import net from 'net';
import { exec } from 'child_process';

const { print, getPrinters } = pdfToPrinter;

// Controle da fila de impressão
let isPrinting = false;
const printQueue = [];

const printerStates = new Map(); // Map<printerName, {status: 'idle'|'busy', jobStartTime: Date, jobId: string, lastSuccessTime?: number, lastFailureTime?: number, lastError?: string, lastJobId?: string, lastJobDuration?: number}>

const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;


class PrintService {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'zebra-print-jobs');
    this.ensureTempDir();
    
    this.setupCleanupInterval();
    
    this.setupPrinterStateCheck();
  }


  async ensureTempDir() {
    await fs.ensureDir(this.tempDir);
    console.log(`[Setup] Diretório temporário criado em: ${this.tempDir}`);
    
    await this.cleanupTempFiles();
  }
  
  
  setupCleanupInterval() {
    setInterval(() => {
      this.cleanupTempFiles().catch(err => {
        console.error('[Cleanup] Erro ao limpar arquivos temporários:', err);
      });
    }, 10 * 60 * 1000); // 10 minutos
  }
  
  
  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      let count = 0;
      
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000; // 1 hora em milissegundos
      
      for (const file of files) {
        try {
          const filePath = path.join(this.tempDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtimeMs > ONE_HOUR) {
            await fs.unlink(filePath);
            count++;
          }
        } catch (err) {
          console.warn(`[Cleanup] Erro ao processar arquivo: ${err.message}`);
        }
      }
      
      if (count > 0) {
        console.log(`[Cleanup] ${count} arquivos temporários antigos removidos`);
      }
    } catch (err) {
      console.error('[Cleanup] Erro ao listar diretório temporário:', err);
    }
  }
  
  
  setupPrinterStateCheck() {
    setInterval(() => {
      this.checkPrinterStates().catch(err => {
        console.error('[Printer State] Erro ao verificar estado das impressoras:', err);
      });
    }, 30 * 1000); // 30 segundos
  }
  
  
  async checkPrinterStates() {
    const now = Date.now();
    const TIMEOUT_THRESHOLD = 5 * 60 * 1000; // 5 minutos
    
    // Verificar e limpar estados de impressoras que podem ter travado
    for (const [printerName, state] of printerStates.entries()) {
      if (state.status === 'busy' && now - state.jobStartTime > TIMEOUT_THRESHOLD) {
        console.warn(`[Printer State] Impressora ${printerName} parece estar presa em um trabalho por mais de 5 minutos. Resetando estado.`);
        printerStates.set(printerName, {
          status: 'idle',
          jobId: null,
          jobStartTime: null,
          lastResetTime: now
        });
      }
    }
  }
  
  
  isPrinterBusy(printerName) {
    if (!printerStates.has(printerName)) {
      return false;
    }
    
    return printerStates.get(printerName).status === 'busy';
  }
  
  
  markPrinterAsBusy(printerName, jobId) {
    const prev = printerStates.get(printerName) || {};
    printerStates.set(printerName, {
      status: 'busy',
      jobId,
      jobStartTime: Date.now(),
      lastResetTime: null,
      lastSuccessTime: prev.lastSuccessTime,
      lastFailureTime: prev.lastFailureTime,
      lastError: prev.lastError,
      lastJobId: prev.lastJobId,
      lastJobDuration: prev.lastJobDuration
    });
    
    console.log(`[Printer State] Impressora ${printerName} agora está ocupada com o job ${jobId}`);
  }
  
  
  markPrinterAsIdle(printerName, { success = true, error = null } = {}) {
    const now = Date.now();
    if (printerStates.has(printerName)) {
      const oldState = printerStates.get(printerName);
      const duration = oldState.jobStartTime ? now - oldState.jobStartTime : null;
      printerStates.set(printerName, {
        status: 'idle',
        jobId: null,
        jobStartTime: null,
        lastResetTime: now,
        lastJobId: oldState.jobId,
        lastJobDuration: duration,
        lastSuccessTime: success ? now : oldState.lastSuccessTime,
        lastFailureTime: !success ? now : oldState.lastFailureTime,
        lastError: !success && error ? (error.message || String(error)) : (success ? null : oldState.lastError)
      });
      console.log(`[Printer State] Impressora ${printerName} agora está livre (job anterior: ${oldState.jobId}, duração: ${duration ? duration / 1000 : '0'}s, sucesso=${success})`);
    } else {
      printerStates.set(printerName, {
        status: 'idle',
        jobId: null,
        jobStartTime: null,
        lastResetTime: now,
        lastSuccessTime: success ? now : undefined,
        lastFailureTime: !success ? now : undefined,
        lastError: !success && error ? (error.message || String(error)) : undefined
      });
    }
  }
  
  
  getPrinterState(printerName) {
    if (!printerStates.has(printerName)) {
      return {
        status: 'unknown',
        message: 'Estado da impressora desconhecido'
      };
    }
    
    const state = printerStates.get(printerName);
    
    if (state.status === 'busy') {
      const durationSec = Math.round((Date.now() - state.jobStartTime) / 1000);
      return {
        status: 'busy',
        jobId: state.jobId,
        duration: durationSec,
        message: `Impressora ocupada há ${durationSec} segundos com o trabalho ${state.jobId}`
      };
    }
    
    return {
      status: 'idle',
      lastJobId: state.lastJobId,
      lastJobDuration: state.lastJobDuration ? Math.round(state.lastJobDuration / 1000) : null,
      lastSuccessTime: state.lastSuccessTime ? new Date(state.lastSuccessTime).toISOString() : null,
      lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
      lastError: state.lastError || null,
      message: 'Impressora disponível'
    };
  }

  async getOrInitPrinterState(printerName) {
    // Se já existe, reutiliza
    if (printerStates.has(printerName)) {
      return this.getPrinterState(printerName);
    }
    try {
      const printers = await this.getAvailablePrinters();
      const targetNorm = printerName.toLowerCase().trim();
      const found = printers.find(p => {
        if (!p) return false;
        const n = (p.name || p.Name || '').toLowerCase().trim();
        if (n === targetNorm) return true;
        // matching parcial se for claramente a zebra única
        if (n.includes(targetNorm) || targetNorm.includes(n)) return true;
        return false;
      });
      if (found) {
        // Inicializa estado como idle sem jobs anteriores
        printerStates.set(printerName, {
          status: 'idle',
          jobId: null,
          jobStartTime: null,
          lastResetTime: Date.now(),
          lastSuccessTime: null,
          lastFailureTime: null,
          lastError: null,
          lastJobId: null,
          lastJobDuration: null
        });
        return this.getPrinterState(printerName);
      }
      return { status: 'unknown', message: 'Impressora não encontrada localmente (verifique nome exato com /printers)' };
    } catch (err) {
      return { status: 'unknown', message: `Falha ao detectar impressora: ${err.message}` };
    }
  }
  
  
  getAllPrinterStates() {
    const states = {};
    for (const [printerName, state] of printerStates.entries()) {
      states[printerName] = this.getPrinterState(printerName);
    }
    return states;
  }


  async getAvailablePrinters() {
    try {
      let printers = await getPrinters();
      if (!printers || !Array.isArray(printers) || printers.length === 0) {
        throw new Error('Lista vazia ou inválida');
      }
      this._logPrinters(printers, 'pdf-to-printer');
      return printers;
    } catch (error) {
      console.error('Erro ao obter impressoras disponíveis (getPrinters):', error);
      // Fallback Windows com PowerShell
      if (process.platform === 'win32') {
        try {
          const psCommand = 'powershell -NoProfile -Command "Get-Printer | Select-Object -Property Name,DriverName,Shared,ShareName | ConvertTo-Json"';
          const { stdout } = await this.execCommand(psCommand, { timeout: 15000 });
          let parsed = [];
          try { parsed = JSON.parse(stdout); } catch (e) { console.warn('Falha ao parsear JSON PowerShell:', e.message); }
          if (parsed && !Array.isArray(parsed)) parsed = [parsed];
          const mapped = (parsed || []).filter(p => p && p.Name).map(p => ({
            name: p.Name,
            driver: p.DriverName,
            shared: p.Shared,
            shareName: p.ShareName,
            source: 'powershell'
          }));
          this._logPrinters(mapped, 'powershell');
          return mapped;
        } catch (psErr) {
          console.error('Fallback PowerShell falhou:', psErr.message);
        }
      }
      return [];
    }
  }

  _logPrinters(printers, source) {
    console.log(`Impressoras encontradas (${source}): ${printers.length}`);
    printers.forEach((printer, index) => {
      const name = printer?.name || printer?.Name || 'Nome não disponível';
      console.log(`  [${index + 1}] ${name}`);
    });
  }

  
  async findZebraPrinter() {
    try {
      const printers = await this.getAvailablePrinters();
      
      if (!Array.isArray(printers)) {
        console.log('Printers não é um array válido:', printers);
        return null;
      }

      const zebraPatterns = [
        'zebra',
        'zdesigner',
        'zd220',
        'zd230',
        'zd410',
        'zd420',
        'zd500',
        'zd620',
        'zt200',
        'zt300',
        'zt400',
        'zt500',
        'zt600',
        'gc420',
        'gk420',
        'gx420',
        'gx430',
        'zpl'
      ];
      
      return printers.find(printer => {
        if (!printer) return false;
        
        const name = printer.name && typeof printer.name === 'string' 
          ? printer.name.toLowerCase() 
          : '';
          
        const displayName = printer.displayName && typeof printer.displayName === 'string' 
          ? printer.displayName.toLowerCase() 
          : '';
        
        for (const pattern of zebraPatterns) {
          if (name.includes(pattern) || displayName.includes(pattern)) {
            console.log(`Impressora Zebra encontrada: ${printer.name} (corresponde ao padrão: ${pattern})`);
            return true;
          }
        }
        
        return false;
      });
    } catch (error) {
      console.error('Erro ao buscar impressora Zebra:', error);
      return null;
    }
  }

  
  async savePdfToTemp(pdfBuffer) {
    const timestamp = new Date().getTime();
    const filePath = path.join(this.tempDir, `print-job-${timestamp}.pdf`);
    
    await fs.writeFile(filePath, pdfBuffer);
    return filePath;
  }
  

  async downloadPdfFromUrl(url) {
    // Implementar controle de concorrência para downloads
    while (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      // Esperar um pouco antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    activeDownloads++;
    console.log(`[Download] Iniciando download do PDF: ${url} (Downloads ativos: ${activeDownloads})`);
    
    try {
      return await this._performDownload(url);
    } finally {
      activeDownloads--;
      console.log(`[Download] Download concluído/falhou: ${url} (Downloads ativos restantes: ${activeDownloads})`);
    }
  }
  
  async _performDownload(url) {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().getTime();
      const filePath = path.join(this.tempDir, `print-job-${timestamp}.pdf`);
      
      const fileStream = fs.createWriteStream(filePath);
      let isCompleted = false;
      
      const httpClient = url.startsWith('https') ? https : http;
      
      // Definir timeout para a requisição
      const request = httpClient.get(url, { timeout: 30000 }, (response) => {
        if (response.statusCode !== 200) {
          cleanup();
          reject(new Error(`Failed to download PDF: HTTP Status ${response.statusCode}`));
          return;
        }
        
        // Verificar o tamanho do arquivo
        const contentLength = parseInt(response.headers['content-length'], 10);
        if (contentLength && contentLength > 15 * 1024 * 1024) { // 15MB
          cleanup();
          reject(new Error(`PDF too large: ${Math.round(contentLength / 1024 / 1024)}MB`));
          return;
        }
        
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/pdf')) {
          console.warn(`Warning: Content type is not PDF, received: ${contentType}`);
        }
        
        response.pipe(fileStream);
        
        response.on('error', (err) => {
          cleanup();
          reject(new Error(`Response error: ${err.message}`));
        });
        
        fileStream.on('finish', () => {
          if (isCompleted) return;
          isCompleted = true;
          fileStream.close();
          resolve(filePath);
        });
      });
      
      // Definir timeout para a requisição
      request.setTimeout(30000, () => {
        request.abort();
        cleanup();
        reject(new Error('Download timeout after 30 seconds'));
      });
      
      request.on('error', (err) => {
        cleanup();
        reject(new Error(`Request error: ${err.message}`));
      });
      
      fileStream.on('error', (err) => {
        cleanup();
        reject(new Error(`File write error: ${err.message}`));
      });
      
      // Função para limpar recursos em caso de erro
      function cleanup() {
        if (isCompleted) return;
        isCompleted = true;
        try {
          fileStream.close();
          fs.unlink(filePath, () => {});
        } catch (e) {
          console.error('Error during cleanup:', e);
        }
      }
    });
  }

  async processPrintJob(filePath, printerName = null) {
    // Gerar um ID único para este trabalho de impressão
    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    try {
      console.log(`[Process Job] Iniciando job ${jobId} para arquivo: ${filePath}`);
      
      // Verifica se o arquivo existe antes de tentar imprimir
      if (!await fs.pathExists(filePath)) {
        throw new Error(`PDF file not found: ${filePath}`);
      }
      
      if (!printerName) {
        console.log(`[Process Job] Nenhuma impressora especificada, buscando impressora Zebra`);
        const zebraPrinter = await this.findZebraPrinter();
        if (!zebraPrinter) {
          throw new Error('Zebra printer not found');
        }
        printerName = zebraPrinter.name;
      }
      
      // Verificar se a impressora está ocupada
      if (this.isPrinterBusy(printerName)) {
        const state = this.getPrinterState(printerName);
        throw new Error(`Impressora ${printerName} está ocupada: ${state.message}`);
      }

      // Marcar impressora como ocupada
      this.markPrinterAsBusy(printerName, jobId);

      const options = {
        printer: printerName,
        scale: 'noscale', // Don't scale the PDF
        silent: true, // Run silently without showing print dialog
      };

      console.log(`[Process Job] Enviando job ${jobId} para impressora: ${printerName}`);
      
      try {
        await print(filePath, options);
        console.log(`[Process Job] Documento ${jobId} impresso com sucesso para ${printerName}`);
        return jobId;
      } catch (printError) {
        throw printError;
      } finally {
        // Independentemente do resultado da impressão, marcar a impressora como livre
        this.markPrinterAsIdle(printerName);
      }
      
    } catch (error) {
      console.error(`[Process Job] Falha na impressão do job ${jobId}:`, error);
      throw new Error(`Print job failed: ${error.message}`);
    } finally {
      // Sempre tenta limpar o arquivo temporário, mesmo em caso de erro
      try {
        if (await fs.pathExists(filePath)) {
          await fs.unlink(filePath);
          console.log(`[Process Job] Arquivo temporário do job ${jobId} removido: ${filePath}`);
        }
      } catch (cleanupError) {
        console.warn(`[Process Job] Erro ao remover arquivo temporário do job ${jobId}: ${cleanupError.message}`);
      }
    }
  }

  async processNextInQueue() {
    // Evita chamadas recursivas excessivas
    if (printQueue.length === 0) {
      isPrinting = false;
      return;
    }

    if (isPrinting) {
      // Se já está imprimindo, não faz nada
      return;
    }
    
    // Loop para processar a fila sem usar recursão
    while (printQueue.length > 0) {
      isPrinting = true;
      
      // Pegar o próximo trabalho, mas não remover ainda
      const nextJob = printQueue[0];
      
      // Verificar se é um job de impressão direta por IP
      if (nextJob.directIp) {
        const targetKey = nextJob.ip; // usar IP como chave de estado
        if (this.isPrinterBusy(targetKey)) {
          const state = this.getPrinterState(targetKey);
          if (state.duration > 30) {
            console.log(`[Print Queue] Impressora IP ${targetKey} ocupada há ${state.duration}s, tentando novamente em 5s...`);
            setTimeout(() => this.processNextInQueue(), 5000);
            isPrinting = false;
            return;
          }
          console.log(`[Print Queue] Impressora IP ${targetKey} ocupada há ${state.duration}s, aguardando 2s...`);
          setTimeout(() => this.processNextInQueue(), 2000);
          isPrinting = false;
          return;
        }
        // Processar job IP
        const job = printQueue.shift();
        console.log(`[Print Queue] Processando job IP (${job.ip}), ${printQueue.length} restantes na fila`);
        try {
          const jobId = await this.processIpPrintJob(job);
          job.resolve({
            success: true,
            message: 'Document sent directly to printer IP successfully',
            jobId,
            printerIp: job.ip,
            mode: job.zpl ? 'zpl' : 'raw'
          });
        } catch (error) {
          console.error(`[Print Queue] Erro ao processar job IP:`, error);
          job.reject(error);
        }
        continue; // seguir para próximo se houver
      }

      // Verificar se é um job de ZPL via spool (USB compartilhada / CUPS)
      if (nextJob.zplShared) {
        const key = nextJob.printerName || nextJob.sharePath || 'shared-unknown';
        if (this.isPrinterBusy(key)) {
          const state = this.getPrinterState(key);
            if (state.duration > 30) {
              console.log(`[Print Queue] Impressora compartilhada ${key} ocupada há ${state.duration}s, tentando novamente em 5s...`);
              setTimeout(() => this.processNextInQueue(), 5000);
              isPrinting = false;
              return;
            }
            console.log(`[Print Queue] Impressora compartilhada ${key} ocupada há ${state.duration}s, aguardando 2s...`);
            setTimeout(() => this.processNextInQueue(), 2000);
            isPrinting = false;
            return;
        }
        const job = printQueue.shift();
        console.log(`[Print Queue] Processando job ZPL compartilhado (${key}), ${printQueue.length} restantes na fila`);
        try {
          const jobId = await this.processSharedZplJob(job);
          job.resolve({ success: true, message: 'ZPL enviado via spool', jobId, printerKey: key, mode: 'zpl-shared' });
        } catch (error) {
          console.error(`[Print Queue] Erro em job ZPL compartilhado:`, error);
          job.reject(error);
        }
        continue;
      }

      // Verificar se é um job de PDF via spool (USB compartilhada / CUPS)
      if (nextJob.pdfShared) {
        const key = nextJob.printerName || nextJob.sharePath || 'shared-unknown';
        if (this.isPrinterBusy(key)) {
          const state = this.getPrinterState(key);
          if (state.duration > 60) {
            console.log(`[Print Queue] Impressora compartilhada ${key} (PDF) ocupada há ${state.duration}s, tentando em 10s...`);
            setTimeout(() => this.processNextInQueue(), 10000);
            isPrinting = false;
            return;
          }
          console.log(`[Print Queue] Impressora compartilhada ${key} (PDF) ocupada há ${state.duration}s, aguardando 3s...`);
            setTimeout(() => this.processNextInQueue(), 3000);
            isPrinting = false;
            return;
        }
        const job = printQueue.shift();
        console.log(`[Print Queue] Processando job PDF compartilhado (${key}), ${printQueue.length} restantes`);
        try {
          const jobId = await this.processSharedPdfJob(job);
          job.resolve({ success: true, message: 'PDF enviado via spool', jobId, printerKey: key, mode: 'pdf-shared' });
        } catch (error) {
          console.error('[Print Queue] Erro em job PDF compartilhado:', error);
          job.reject(error);
        }
        continue;
      }

      // Job normal baseado em nome de impressora
      const targetPrinterName = nextJob.printerName || await this.getDefaultPrinterName();
      if (this.isPrinterBusy(targetPrinterName)) {
        const state = this.getPrinterState(targetPrinterName);
        if (state.duration > 30) {
          console.log(`[Print Queue] Impressora ${targetPrinterName} ocupada há ${state.duration}s, procurando alternativa...`);
          setTimeout(() => this.processNextInQueue(), 5000);
          isPrinting = false;
          return;
        }
        console.log(`[Print Queue] Impressora ${targetPrinterName} ocupada há ${state.duration}s, aguardando...`);
        setTimeout(() => this.processNextInQueue(), 2000);
        isPrinting = false;
        return;
      }
      const job = printQueue.shift();
      console.log(`[Print Queue] Processando job, ${printQueue.length} restantes na fila`);
      try {
        const jobId = await this.processPrintJob(job.filePath, job.printerName);
        job.resolve({
          success: true,
          message: 'Document printed successfully',
          jobId,
          printerName: targetPrinterName
        });
      } catch (error) {
        console.error(`[Print Queue] Erro ao processar job:`, error);
        if (error.message && error.message.includes('está ocupada')) {
          printQueue.unshift(job);
          console.log(`[Print Queue] Job recolocado na fila devido a impressora ocupada`);
          setTimeout(() => this.processNextInQueue(), 3000);
          isPrinting = false;
          return;
        }
        job.reject(error);
      }
    }
    
    isPrinting = false;
    console.log(`[Print Queue] Fila de impressão vazia`);
  }
  
  
  async getDefaultPrinterName() {
    try {
      const zebraPrinter = await this.findZebraPrinter();
      if (zebraPrinter) {
        return zebraPrinter.name;
      }
      
      // Se não encontrar uma impressora Zebra, pega a primeira disponível
      const printers = await this.getAvailablePrinters();
      if (printers && printers.length > 0 && printers[0].name) {
        return printers[0].name;
      }
      
      throw new Error('Nenhuma impressora disponível');
    } catch (error) {
      console.error('[Default Printer] Erro ao obter impressora padrão:', error);
      throw error;
    }
  }

  async printPdf(pdfBuffer, printerName = null) {
    try {
      console.log(`[Print PDF] Salvando PDF em arquivo temporário`);
      const filePath = await this.savePdfToTemp(pdfBuffer);
      
      return new Promise((resolve, reject) => {
        // Definir um timeout para evitar promessas pendentes eternamente
        const timeoutId = setTimeout(() => {
          reject(new Error('Print job timeout after 120 seconds'));
        }, 120000); // 2 minutos de timeout
        
        printQueue.push({ 
          filePath, 
          printerName, 
          resolve: (result) => {
            clearTimeout(timeoutId);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          }
        });
        
        console.log(`[Print Queue] Job adicionado à fila, total: ${printQueue.length}`);
        
        if (!isPrinting) {
          this.processNextInQueue();
        }
      });
      
    } catch (error) {
      console.error('Error printing PDF from buffer:', error);
      throw new Error(`Failed to print PDF: ${error.message}`);
    }
  }
  
  
  async printPdfFromUrl(pdfUrl, printerName = null) {
    try {
      console.log(`[Print URL] Iniciando impressão de ${pdfUrl}`);
      const filePath = await this.downloadPdfFromUrl(pdfUrl);
      
      return new Promise((resolve, reject) => {
        // Definir um timeout para evitar promessas pendentes eternamente
        const timeoutId = setTimeout(() => {
          reject(new Error('Print job timeout after 120 seconds'));
        }, 120000); // 2 minutos de timeout
        
        printQueue.push({ 
          filePath, 
          printerName, 
          resolve: (result) => {
            clearTimeout(timeoutId);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          }
        });
        
        console.log(`[Print Queue] Job adicionado à fila de URL, total: ${printQueue.length}`);
        
        if (!isPrinting) {
          this.processNextInQueue();
        }
      });
      
    } catch (error) {
      console.error('Error printing PDF from URL:', error);
      throw new Error(`Failed to print PDF from URL: ${error.message}`);
    }
  }

  // ===================== Impressão Direta via IP =====================
  async processIpPrintJob(job) {
    const jobId = `ip_job_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const key = job.ip;
    this.markPrinterAsBusy(key, jobId);
    try {
      let buffer;
      if (job.zpl) {
        buffer = Buffer.from(job.zpl, 'utf8');
      } else if (job.filePath) {
        if (!await fs.pathExists(job.filePath)) {
          throw new Error(`Arquivo não encontrado para envio: ${job.filePath}`);
        }
        buffer = await fs.readFile(job.filePath);
      } else if (job.buffer) {
        buffer = job.buffer;
      } else {
        throw new Error('Nenhum conteúdo para impressão IP');
      }

      await this.sendRawBufferToIp(buffer, job.ip, { isZpl: !!job.zpl, port: job.port });
      // sucesso
      this.markPrinterAsIdle(key, { success: true });
      return jobId;
    } catch (err) {
      // falha
      this.markPrinterAsIdle(key, { success: false, error: err });
      throw err;
    } finally {
      // limpar arquivo temporário se houver
      try {
        if (job.filePath && await fs.pathExists(job.filePath)) {
          await fs.unlink(job.filePath);
        }
      } catch (e) {
        console.warn(`[IP Print] Falha ao remover arquivo temporário: ${e.message}`);
      }
    }
  }

  async sendRawBufferToIp(buffer, ip, { isZpl = false, port = null } = {}) {
    const rawPort = port || parseInt(process.env.PRINTER_RAW_PORT, 10) || 9100;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: ip, port: rawPort }, () => {
        console.log(`[IP Print] Conexão estabelecida com ${ip}:${rawPort} (tamanho ${buffer.length} bytes, tipo=${isZpl ? 'ZPL' : 'RAW'})`);
        socket.write(buffer);
        socket.end();
      });
      socket.setTimeout(30000);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Timeout ao enviar dados para a impressora IP (${ip}:${rawPort})`));
      });
      socket.on('error', (err) => {
        reject(new Error(`Erro de socket: ${err.message}`));
      });
      socket.on('close', () => {
        console.log('[IP Print] Conexão encerrada');
        resolve(true);
      });
    });
  }

  async testPrinterConnectivity(ip, port = null, { timeoutMs = 5000 } = {}) {
    const rawPort = port || parseInt(process.env.PRINTER_RAW_PORT, 10) || 9100;
    const start = Date.now();
    return new Promise((resolve) => {
      let settled = false;
      const socket = net.createConnection({ host: ip, port: rawPort });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ success: false, ip, port: rawPort, latencyMs: null, error: 'timeout', message: `Timeout após ${timeoutMs}ms` });
      }, timeoutMs);
      socket.on('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const latency = Date.now() - start;
        socket.end();
        resolve({ success: true, ip, port: rawPort, latencyMs: latency, message: 'Conexão TCP estabelecida' });
      });
      socket.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, ip, port: rawPort, latencyMs: null, error: err.code || 'ERROR', message: err.message });
      });
      socket.on('timeout', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({ success: false, ip, port: rawPort, latencyMs: null, error: 'timeout', message: 'Socket timeout' });
      });
    });
  }

  async printZplToIp(zplString, ip, port = null) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Print job timeout after 120 seconds')), 120000);
      printQueue.push({
        directIp: true,
        ip,
        port,
        zpl: zplString,
        resolve: (r) => { clearTimeout(timeoutId); resolve(r); },
        reject: (e) => { clearTimeout(timeoutId); reject(e); }
      });
      console.log(`[Print Queue] Job ZPL para IP ${ip} adicionado. Total fila: ${printQueue.length}`);
      if (!isPrinting) this.processNextInQueue();
    });
  }

  async printPdfFromUrlToIp(pdfUrl, ip, port = null) {
    try {
      console.log(`[IP PDF] Download e envio de PDF para IP ${ip}: ${pdfUrl}`);
      const filePath = await this.downloadPdfFromUrl(pdfUrl);
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Print job timeout after 120 seconds')), 120000);
        printQueue.push({
          directIp: true,
          ip,
          port,
          filePath,
          resolve: (r) => { clearTimeout(timeoutId); resolve(r); },
          reject: (e) => { clearTimeout(timeoutId); reject(e); }
        });
        console.log(`[Print Queue] Job PDF->IP ${ip} adicionado. Total fila: ${printQueue.length}`);
        if (!isPrinting) this.processNextInQueue();
      });
    } catch (error) {
      console.error('[IP PDF] Erro ao preparar PDF para IP:', error);
      throw new Error(`Falha ao preparar PDF para IP: ${error.message}`);
    }
  }

  // ===================== Impressão ZPL via Spool (USB compartilhada / CUPS) =====================
  async createTempZplFile(zplString) {
    const timestamp = Date.now();
    const filePath = path.join(this.tempDir, `print-job-${timestamp}.zpl`);
    await fs.writeFile(filePath, zplString, 'utf8');
    return filePath;
  }

  async processSharedZplJob(job) {
    const jobId = `spool_job_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const key = job.printerName || job.sharePath || 'shared-unknown';
    this.markPrinterAsBusy(key, jobId);
    let tempPath = null;
    try {
      tempPath = await this.createTempZplFile(job.zpl);
      const platform = process.platform; // win32, linux, darwin
      if (platform === 'win32') {
        let command;
        if (job.sharePath) {
          // Garantir que tenha o prefixo \\ para UNC
          let share = job.sharePath;
          if (!share.startsWith('\\\\')) {
            // Substituir inicial simples \\ caso fornecido simples
            share = share.replace(/^\\/, '');
            share = `\\\\${share}`;
          }
          command = `cmd /c copy /B "${tempPath}" "${share}"`;
        } else if (job.printerName) {
          // Usar PowerShell Out-Printer (pode não ser 100% RAW, mas geralmente funciona com ZPL se driver raw)
          const escaped = job.printerName.replace(/"/g, '\"');
          command = `powershell -Command "Get-Content -Raw -Path '${tempPath}' | Out-Printer -Name \"${escaped}\""`;
        } else {
          throw new Error('Nenhuma sharePath ou printerName fornecida para spool Windows');
        }
        await this.execCommand(command, { timeout: 30000 });
      } else {
        // Linux / macOS via CUPS
        if (!job.printerName) {
          throw new Error('printerName é obrigatório em sistemas não Windows para spool');
        }
        const escaped = job.printerName.replace(/"/g, '\"');
        const command = `lp -d "${escaped}" -o raw "${tempPath}"`;
        await this.execCommand(command, { timeout: 30000 });
      }
      this.markPrinterAsIdle(key, { success: true });
      return jobId;
    } catch (err) {
      this.markPrinterAsIdle(key, { success: false, error: err });
      throw err;
    } finally {
      if (tempPath) {
        try { await fs.unlink(tempPath); } catch (e) { console.warn(`[Spool ZPL] Falha ao remover temp: ${e.message}`); }
      }
    }
  }

  async execCommand(command, { timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const child = exec(command, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`Comando falhou: ${error.message} | stderr: ${stderr}`));
        }
        resolve({ stdout, stderr });
      });
      if (timeout) {
        setTimeout(() => {
          try { child.kill(); } catch {}
          reject(new Error(`Timeout ao executar comando: ${command}`));
        }, timeout);
      }
    });
  }

  async printZplShared(zplString, { printerName = null, sharePath = null } = {}) {
    if (!printerName && !sharePath) {
      throw new Error('É necessário fornecer printerName ou sharePath para impressão compartilhada');
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Print job timeout after 120 seconds')), 120000);
      printQueue.push({
        zplShared: true,
        printerName,
        sharePath,
        zpl: zplString,
        resolve: (r) => { clearTimeout(timeoutId); resolve(r); },
        reject: (e) => { clearTimeout(timeoutId); reject(e); }
      });
      console.log(`[Print Queue] Job ZPL compartilhado adicionado. Total fila: ${printQueue.length}`);
      if (!isPrinting) this.processNextInQueue();
    });
  }

  // ===================== Impressão PDF via Spool (USB compartilhada / CUPS) =====================
  async processSharedPdfJob(job) {
    const jobId = `spool_pdf_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const key = job.printerName || job.sharePath || 'shared-unknown';
    this.markPrinterAsBusy(key, jobId);
    try {
      const platform = process.platform;
      if (!await fs.pathExists(job.filePath)) {
        throw new Error('Arquivo PDF não encontrado para spool');
      }
      if (platform === 'win32') {
        let command;
        if (job.sharePath) {
          let share = job.sharePath;
            if (!share.startsWith('\\\\')) {
              share = share.replace(/^\\/, '');
              share = `\\\\${share}`;
            }
          // Para PDF a cópia raw pode não ser interpretada; então usamos printui/spooler via powershell.
          // Estratégia: usar "Start-Process -FilePath <pdf> -Verb PrintTo -ArgumentList printerName" se printerName existir.
          if (job.printerName) {
            const escapedPrinter = job.printerName.replace(/"/g, '\"');
            command = `powershell -Command "Start-Process -FilePath '${job.filePath}' -Verb PrintTo -ArgumentList \"'${escapedPrinter}'\" -WindowStyle Hidden"`;
          } else {
            // fallback: tentativa com rundll32 (menos confiável)
            command = `rundll32 printui.dll,PrintUIEntry /y`;
            console.warn('[Spool PDF] Nenhum printerName fornecido; considere enviar printerName para melhor confiabilidade.');
          }
        } else if (job.printerName) {
          const escapedPrinter = job.printerName.replace(/"/g, '\"');
          command = `powershell -Command "Start-Process -FilePath '${job.filePath}' -Verb PrintTo -ArgumentList \"'${escapedPrinter}'\" -WindowStyle Hidden"`;
        } else {
          throw new Error('Forneça printerName ou sharePath para spool PDF em Windows');
        }
        await this.execCommand(command, { timeout: 60000 });
      } else {
        // Linux/macOS via CUPS
        if (!job.printerName) {
          throw new Error('printerName é obrigatório para PDF via spool em sistemas não Windows');
        }
        const escaped = job.printerName.replace(/"/g, '\"');
        const command = `lp -d "${escaped}" "${job.filePath}"`;
        await this.execCommand(command, { timeout: 60000 });
      }
      this.markPrinterAsIdle(key, { success: true });
      return jobId;
    } catch (err) {
      this.markPrinterAsIdle(key, { success: false, error: err });
      throw err;
    } finally {
      try { if (await fs.pathExists(job.filePath)) await fs.unlink(job.filePath); } catch (e) { console.warn(`[Spool PDF] Falha ao remover temp: ${e.message}`); }
    }
  }

  async printPdfSharedFromUrl(pdfUrl, { printerName = null, sharePath = null } = {}) {
    if (!printerName && !sharePath) {
      throw new Error('É necessário fornecer printerName ou sharePath para PDF via spool');
    }
    console.log(`[PDF Spool] Download PDF para spool compartilhado: ${pdfUrl}`);
    const filePath = await this.downloadPdfFromUrl(pdfUrl);
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Print job timeout after 180 seconds')), 180000);
      printQueue.push({
        pdfShared: true,
        printerName,
        sharePath,
        filePath,
        resolve: (r) => { clearTimeout(timeoutId); resolve(r); },
        reject: (e) => { clearTimeout(timeoutId); reject(e); }
      });
      console.log(`[Print Queue] Job PDF compartilhado adicionado. Total fila: ${printQueue.length}`);
      if (!isPrinting) this.processNextInQueue();
    });
  }
}

export default new PrintService();
