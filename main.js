const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { startWebSocketServer, sendCloseTab } = require('./ws-server');

// Set up logging
function log(type, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`, data ? data : '');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'Unhandled Rejection:', { reason, promise });
});

let mainWindow;
const DISTRACTION_KEYWORDS = ['youtube', 'instagram'];
let lastDistraction = 0;
let lastDistractionTabId = null;
let distractionWindowRef = null;
let freezeInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    alwaysOnTop: true,
    skipTaskbar: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWindow.loadFile('index.html');
}

function createDistractionWindow() {
  // If window already exists, just focus it
  if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
    distractionWindowRef.focus();
    return distractionWindowRef;
  }

  distractionWindowRef = new BrowserWindow({
    width: 400,
    height: 300,
    alwaysOnTop: true,
    skipTaskbar: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Clean up reference when window is closed
  distractionWindowRef.on('closed', () => { 
    distractionWindowRef = null; 
    if (freezeInterval) {
      clearInterval(freezeInterval);
      freezeInterval = null;
    }
  });

  distractionWindowRef.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang='en'>
    <head>
      <meta charset='UTF-8'>
      <title>Stay Focused!</title>
      <style>
        body { 
          font-family: 'Inter', 'Segoe UI', sans-serif; 
          background: #f7f7fa; 
          margin: 0; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center; 
          height: 100vh; 
        }
        h2 { color: #6a4cff; margin-bottom: 0.5em; font-size: 2rem; }
        p { color: #444; font-size: 1.1rem; margin-bottom: 1.5em; text-align: center; }
        button { 
          margin-top: 1.5rem; 
          padding: 0.7rem 2.2rem; 
          border: none; 
          border-radius: 8px; 
          background: linear-gradient(90deg, #6a4cff 0%, #b86bff 100%); 
          color: #fff; 
          font-size: 1.1rem; 
          font-weight: 600; 
          cursor: pointer; 
          transition: all 0.2s;
        }
        button:hover { background: linear-gradient(90deg, #b86bff 0%, #6a4cff 100%); }
        button:active { transform: scale(0.98); }
      </style>
    </head>
    <body>
      <h2>Stay Focused! ✨</h2>
      <p>Oops! You might be getting distracted.<br>Close those tabs or apps (YouTube, Instagram, etc.) and get back on track!</p>
      <button id='close-btn'>I'm back!</button>
      <script>
        let freezeInterval = null;
        
        function initializeWindow() {
          const closeBtn = document.getElementById('close-btn');
          
          if (closeBtn && window.electronAPI) {
            closeBtn.addEventListener('click', () => {
              try {
                // Clear any freeze intervals first
                if (freezeInterval) {
                  clearInterval(freezeInterval);
                  freezeInterval = null;
                }
                
                // Send the close message
                window.electronAPI.sendMessage('close-distraction-tab');
                
                // Disable the button to prevent multiple clicks
                closeBtn.disabled = true;
                closeBtn.textContent = 'Closing...';
                
                console.log('Close message sent successfully');
              } catch (e) {
                console.error('Error sending close message:', e);
              }
            });

            // Start the freeze interval
            freezeInterval = setInterval(() => {
              try {
                if (window.electronAPI) {
                  window.electronAPI.sendMessage('freeze-distraction-tab');
                }
              } catch (e) {
                console.error('Error sending freeze message:', e);
                if (freezeInterval) {
                  clearInterval(freezeInterval);
                  freezeInterval = null;
                }
              }
            }, 2000); // Reduced frequency to every 2 seconds

            console.log('Distraction window initialized successfully');
          } else {
            console.error('Missing elements or electronAPI not available');
          }
        }

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initializeWindow);
        } else {
          initializeWindow();
        }

        // Clean up on window unload
        window.addEventListener('beforeunload', () => {
          if (freezeInterval) {
            clearInterval(freezeInterval);
            freezeInterval = null;
          }
        });

        // Error handling
        window.onerror = (msg, url, line, col, error) => {
          console.error('Window error:', { msg, url, line, col, error });
        };
      </script>
    </body>
    </html>
  `)}`);
  
  distractionWindowRef.webContents.on('did-finish-load', () => {
    log('INFO', 'Distraction window loaded successfully');
  });
  
  distractionWindowRef.webContents.on('console-message', (event, level, message) => {
    log('RENDERER', message, { level });
  });
  
  return distractionWindowRef;
}

function closeDistractionWindow() {
  log('INFO', 'Attempting to close distraction window');
  
  // Clear freeze interval first
  if (freezeInterval) {
    clearInterval(freezeInterval);
    freezeInterval = null;
    log('INFO', 'Cleared freeze interval');
  }

  // Close the window
  if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
    try {
      distractionWindowRef.close();
      log('INFO', 'Distraction window close initiated');
      
      // Force cleanup after a short delay if needed
      setTimeout(() => {
        if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
          try {
            distractionWindowRef.destroy();
            log('INFO', 'Force destroyed distraction window');
          } catch (e) {
            log('ERROR', 'Error force destroying window:', e);
          }
        }
        distractionWindowRef = null;
      }, 500);
      
    } catch (e) {
      log('ERROR', 'Error closing distraction window:', e);
      distractionWindowRef = null;
    }
  } else {
    log('INFO', 'No distraction window to close');
    distractionWindowRef = null;
  }
}

function promptExtensionInstall() {
  const extensionPath = `${__dirname}/extension`;
  setTimeout(() => {
    shell.openPath(extensionPath);
    mainWindow.webContents.executeJavaScript(`
      alert('For best results, please install the FocusTracker browser extension.\\n\\n1. Open Chrome and go to chrome://extensions/\\n2. Enable Developer Mode (top right)\\n3. Drag and drop the extension folder (which just opened) into the page.');
    `);
  }, 500);
}

app.whenReady().then(() => {
  createWindow();
  promptExtensionInstall();
  startWebSocketServer((tabId) => {
    lastDistractionTabId = tabId;
    createDistractionWindow();
  });
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Real distraction detection using get-windows (reduced frequency)
setInterval(async () => {
  try {
    const getWindows = (await import('get-windows')).default;
    const windows = await getWindows();
    const active = windows.find(w => w.isFocused);
    if (!active) return;
    
    const title = (active.title || '').toLowerCase();
    const appName = (active.app || '').toLowerCase();
    const isDistracted = DISTRACTION_KEYWORDS.some(keyword => 
      title.includes(keyword) || appName.includes(keyword)
    );
    
    if (isDistracted && Date.now() - lastDistraction > 30000) {
      lastDistraction = Date.now();
      log('INFO', 'Distraction detected:', { title: active.title, app: active.app });
      createDistractionWindow();
    }
  } catch (e) {
    // Ignore errors but log them occasionally
    if (Math.random() < 0.01) { // Log 1% of errors to avoid spam
      log('ERROR', 'Error in distraction detection:', e);
    }
  }
}, 5000); // Increased interval to 5 seconds

// IPC Event Handlers
ipcMain.on('remind-again', () => {
  log('IPC', 'Received remind-again message');
  setTimeout(() => {
    createDistractionWindow();
  }, 30000);
});

ipcMain.on('freeze-distraction-tab', () => {
  if (lastDistractionTabId) {
    sendCloseTab(lastDistractionTabId, true); // freeze only
  }
});

ipcMain.on('close-distraction-tab', () => {
  const tabToClose = lastDistractionTabId;
  log('IPC', 'Received close-distraction-tab message', { tabId: tabToClose });
  
  // Close the distraction window immediately
  closeDistractionWindow();
  
  // Send close command to browser extension if we have a tab ID
  if (tabToClose) {
    sendCloseTab(tabToClose, false);
    lastDistractionTabId = null;
  }
});