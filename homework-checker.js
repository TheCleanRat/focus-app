// homework-checker.js - Module for checking homework completion
const fs = require('fs').promises;
const path = require('path');

class HomeworkChecker {
  constructor() {
    this.dataDir = path.join(__dirname, 'homework-data');
    this.historyFile = path.join(this.dataDir, 'history.json');
    this.minWordCount = 50; // Minimum word count for completion
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      // Create history file if it doesn't exist
      try {
        await fs.access(this.historyFile);
      } catch {
        await fs.writeFile(this.historyFile, JSON.stringify([]));
      }
    } catch (error) {
      console.error('Error initializing homework checker:', error);
    }
  }

  async checkFile(filePath) {
    const fileExtension = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    let content = '';
    let wordCount = 0;
    let isComplete = false;
    let error = null;

    try {
      switch (fileExtension) {
        case '.pdf':
          content = await this.extractFromPDF(filePath);
          break;
        case '.docx':
          content = await this.extractFromDOCX(filePath);
          break;
        case '.pptx':
          content = await this.extractFromPPTX(filePath);
          break;
        case '.jpg':
        case '.jpeg':
        case '.png':
          content = await this.extractFromImage(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Count words
      wordCount = this.countWords(content);
      isComplete = wordCount >= this.minWordCount;

      // Save to history
      await this.saveToHistory({
        fileName,
        filePath,
        fileType: fileExtension,
        wordCount,
        isComplete,
        timestamp: new Date().toISOString(),
        preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
      });

      return {
        isComplete,
        wordCount,
        fileName,
        fileType: fileExtension,
        preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        minRequired: this.minWordCount
      };

    } catch (err) {
      error = err.message;
      console.error('Error checking file:', err);
      
      return {
        isComplete: false,
        wordCount: 0,
        fileName,
        fileType: fileExtension,
        error,
        minRequired: this.minWordCount
      };
    }
  }

  async extractFromPDF(filePath) {
    // Simple PDF text extraction using basic method
    // In a real implementation, you'd use pdf-parse or similar
    try {
      const buffer = await fs.readFile(filePath);
      const text = buffer.toString('utf8');
      
      // Basic text extraction - look for readable text patterns
      const textMatches = text.match(/[A-Za-z\s]{3,}/g) || [];
      return textMatches.join(' ').replace(/\s+/g, ' ').trim();
    } catch (error) {
      throw new Error('Unable to extract text from PDF. Please ensure the file is not corrupted.');
    }
  }

  async extractFromDOCX(filePath) {
    // Simple DOCX extraction - in real implementation use mammoth or docx-parser
    try {
      const buffer = await fs.readFile(filePath);
      const text = buffer.toString('utf8');
      
      // Look for XML text content typical in DOCX files
      const xmlMatches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
      const extractedText = xmlMatches
        .map(match => match.replace(/<[^>]+>/g, ''))
        .join(' ');
      
      return extractedText || 'Document appears to contain content but text extraction was limited.';
    } catch (error) {
      throw new Error('Unable to extract text from Word document.');
    }
  }

  async extractFromPPTX(filePath) {
    // Simple PPTX extraction
    try {
      const buffer = await fs.readFile(filePath);
      const text = buffer.toString('utf8');
      
      // Look for slide text content
      const textMatches = text.match(/[A-Za-z\s]{5,}/g) || [];
      const extractedText = textMatches
        .filter(match => !match.includes('<?xml'))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return extractedText || 'Presentation appears to contain content.';
    } catch (error) {
      throw new Error('Unable to extract text from PowerPoint presentation.');
    }
  }

  async extractFromImage(filePath) {
    // Simulate OCR - in real implementation use tesseract.js or similar
    try {
      const stats = await fs.stat(filePath);
      const fileSizeKB = Math.round(stats.size / 1024);
      
      // Simple heuristic: larger image files likely contain more content
      if (fileSizeKB < 50) {
        return 'Image appears too small to contain substantial homework content.';
      } else if (fileSizeKB < 200) {
        return 'This appears to be a scanned homework assignment with moderate content. Manual review recommended.';
      } else {
        return 'This appears to be a substantial scanned homework assignment with significant content. The image size suggests it contains meaningful work that would meet completion requirements.';
      }
    } catch (error) {
      throw new Error('Unable to process image file.');
    }
  }

  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
    
    return words.length;
  }

  async saveToHistory(entry) {
    try {
      const history = await this.getHistory();
      history.unshift(entry); // Add to beginning
      
      // Keep only last 50 entries
      if (history.length > 50) {
        history.splice(50);
      }
      
      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Error saving to history:', error);
    }
  }

  async getHistory() {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading history:', error);
      return [];
    }
  }

  setMinWordCount(count) {
    this.minWordCount = Math.max(1, parseInt(count) || 50);
  }
}

module.exports = { HomeworkChecker };