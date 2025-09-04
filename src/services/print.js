import pdfToPrinter from 'pdf-to-printer';
import fs from 'fs-extra';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';

const { print, getPrinters } = pdfToPrinter;

let isPrinting = false;
const printQueue = [];


class PrintService {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'zebra-print-jobs');
    this.ensureTempDir();
  }


  async ensureTempDir() {
    await fs.ensureDir(this.tempDir);
    console.log(`Temporary directory created at: ${this.tempDir}`);
  }


  async getAvailablePrinters() {
    try {
      const printers = await getPrinters();
      return printers;
    } catch (error) {
      console.error('Error getting available printers:', error);
      throw new Error('Failed to get available printers');
    }
  }

  
  async findZebraPrinter() {
    const printers = await this.getAvailablePrinters();
    return printers.find(printer => 
      printer.name.toLowerCase().includes('zebra') || 
      printer.displayName.toLowerCase().includes('zebra')
    );
  }

  
  async savePdfToTemp(pdfBuffer) {
    const timestamp = new Date().getTime();
    const filePath = path.join(this.tempDir, `print-job-${timestamp}.pdf`);
    
    await fs.writeFile(filePath, pdfBuffer);
    return filePath;
  }
  

  async downloadPdfFromUrl(url) {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().getTime();
      const filePath = path.join(this.tempDir, `print-job-${timestamp}.pdf`);
      
      const fileStream = fs.createWriteStream(filePath);
      
      const httpClient = url.startsWith('https') ? https : http;
      
      const request = httpClient.get(url, (response) => {
        if (response.statusCode !== 200) {
          fs.unlink(filePath, () => {});
          reject(new Error(`Failed to download PDF: HTTP Status ${response.statusCode}`));
          return;
        }
        
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/pdf')) {
          console.warn(`Warning: Content type is not PDF, received: ${contentType}`);
        }
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filePath);
        });
      });
      
      request.on('error', (err) => {
        fs.unlink(filePath, () => {}); 
        reject(new Error(`Failed to download PDF: ${err.message}`));
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(filePath, () => {}); 
        reject(new Error(`Failed to save PDF: ${err.message}`));
      });
    });
  }

  async processPrintJob(filePath, printerName = null) {
    try {
      if (!printerName) {
        const zebraPrinter = await this.findZebraPrinter();
        if (!zebraPrinter) {
          throw new Error('Zebra printer not found');
        }
        printerName = zebraPrinter.name;
      }

      const options = {
        printer: printerName,
        // Add any specific Zebra printer options here
        scale: 'noscale', // Don't scale the PDF
        silent: true, // Run silently without showing print dialog
      };

      await print(filePath, options);
      console.log(`Document printed successfully to ${printerName}`);
      
      await fs.unlink(filePath);
      
    } catch (error) {
      console.error('Print job failed:', error);
      throw new Error(`Print job failed: ${error.message}`);
    }
  }

  async processNextInQueue() {
    if (printQueue.length === 0) {
      isPrinting = false;
      return;
    }

    isPrinting = true;
    const job = printQueue.shift();

    try {
      await this.processPrintJob(job.filePath, job.printerName);
      job.resolve({ success: true, message: 'Document printed successfully' });
    } catch (error) {
      job.reject(error);
    } finally {
      this.processNextInQueue();
    }
  }

  async printPdf(pdfBuffer, printerName = null) {
    try {
      const filePath = await this.savePdfToTemp(pdfBuffer);
      
      return new Promise((resolve, reject) => {
        printQueue.push({ filePath, printerName, resolve, reject });
        
        if (!isPrinting) {
          this.processNextInQueue();
        } else {
          console.log('Print job added to queue');
        }
      });
      
    } catch (error) {
      console.error('Error printing PDF from buffer:', error);
      throw new Error(`Failed to print PDF: ${error.message}`);
    }
  }
  
  
  async printPdfFromUrl(pdfUrl, printerName = null) {
    try {
      console.log(`Downloading PDF from URL: ${pdfUrl}`);
      const filePath = await this.downloadPdfFromUrl(pdfUrl);
      
      return new Promise((resolve, reject) => {
        printQueue.push({ filePath, printerName, resolve, reject });
        
        if (!isPrinting) {
          this.processNextInQueue();
        } else {
          console.log('Print job added to queue');
        }
      });
      
    } catch (error) {
      console.error('Error printing PDF from URL:', error);
      throw new Error(`Failed to print PDF from URL: ${error.message}`);
    }
  }
}

export default new PrintService();
