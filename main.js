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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    alwaysOnTop: true, // Make the window stay above all others
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
      contextIsolation: true
    }
  });
  distractionWindowRef.on('closed', () => { distractionWindowRef = null; });
  distractionWindowRef.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang='en'>
    <head>
      <meta charset='UTF-8'>
      <title>Stay Focused!</title>
      <style>
        body { font-family: 'Inter', 'Segoe UI', sans-serif; background: #f7f7fa; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
        h2 { color: #6a4cff; margin-bottom: 0.5em; font-size: 2rem; }
        p { color: #444; font-size: 1.1rem; margin-bottom: 1.5em; text-align: center; }
        button { margin-top: 1.5rem; padding: 0.7rem 2.2rem; border: none; border-radius: 8px; background: linear-gradient(90deg, #6a4cff 0%, #b86bff 100%); color: #fff; font-size: 1.1rem; font-weight: 600; cursor: pointer; }
        button:hover { background: linear-gradient(90deg, #b86bff 0%, #6a4cff 100%); }
      </style>
    </head>
    <body>
      <h2>Stay Focused! ✨</h2>
      <p>Oops! You might be getting distracted.<br>Close those tabs or apps (YouTube, Instagram, etc.) and get back on track!</p>
      <button id='close-btn'>I'm back!</button>
      <script>
        window.addEventListener('DOMContentLoaded', () => {
          try {
            let freezeInterval = null;
            
            // Log any errors that occur
            window.onerror = (msg, url, line, col, error) => {
              console.error('Error:', { msg, url, line, col, error });
            };
            
            document.getElementById('close-btn').addEventListener('click', () => {
              try {
                window.electronAPI.sendMessage('close-distraction-tab');
                console.log('Sent close-distraction-tab message');
              } catch (e) {
                console.error('Error sending close message:', e);
              }
            });

            freezeInterval = setInterval(() => {
              try {
                window.electronAPI.sendMessage('freeze-distraction-tab');
              } catch (e) {
                console.error('Error sending freeze message:', e);
                clearInterval(freezeInterval);
              }
            }, 1000);

            window.addEventListener('beforeunload', () => {
              if (freezeInterval) {
                clearInterval(freezeInterval);
              }
            });

            console.log('Distraction window script initialized');
          } catch (e) {
            console.error('Error in window initialization:', e);
          }
        });
      </script>
    </body>
    </html>
  `)}`);
  
  // Add logging for window events
  distractionWindowRef.webContents.on('did-finish-load', () => {
    log('INFO', 'Distraction window loaded');
  });
  
  distractionWindowRef.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log('RENDERER', message, { level, line, sourceId });
  });
  
  return distractionWindowRef;
}

function promptExtensionInstall() {
  const extensionPath = `${__dirname}/extension`;
  // Use a short delay to ensure the window is ready
  setTimeout(() => {
    shell.openPath(extensionPath); // Open the extension folder in Finder
    mainWindow.webContents.executeJavaScript(`
      alert('For best results, please install the FocusTracker browser extension.\n\n1. Open Chrome and go to chrome://extensions/\n2. Enable Developer Mode (top right)\n3. Drag and drop the extension folder (which just opened) into the page.');
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

// Real distraction detection using get-windows (ESM import)
setInterval(async () => {
  try {
    const getWindows = (await import('get-windows')).default;
    const windows = await getWindows();
    const active = windows.find(w => w.isFocused);
    if (!active) return;
    console.log('Active window info:', active); // Debug log
    const title = (active.title || '').toLowerCase();
    const appName = (active.app || '').toLowerCase();
    const isDistracted = DISTRACTION_KEYWORDS.some(keyword => title.includes(keyword) || appName.includes(keyword));
    if (isDistracted && Date.now() - lastDistraction > 30000) {
      lastDistraction = Date.now();
      createDistractionWindow();
    }
  } catch (e) {
    // Ignore errors
  }
}, 4000);

ipcMain.on('remind-again', () => {
  log('IPC', 'Received remind-again message');
  setTimeout(() => {
    createDistractionWindow();
  }, 30000);
});

ipcMain.on('freeze-distraction-tab', () => {
  log('IPC', 'Received freeze-distraction-tab message', { tabId: lastDistractionTabId });
  if (lastDistractionTabId) {
    sendCloseTab(lastDistractionTabId, true); // true = freeze only, don't close
  } else {
    log('WARN', 'No tab ID available for freezing');
  }
});

ipcMain.on('close-distraction-tab', () => {
  const tabToClose = lastDistractionTabId; // Store the ID locally
  log('IPC', 'Received close-distraction-tab message', { tabId: tabToClose });
  
  // Immediately close the window
  if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
    try {
      log('INFO', 'Attempting to close distraction window');
      distractionWindowRef.destroy();
      log('INFO', 'Successfully destroyed distraction window');
    } catch (e) {
      log('WARN', 'Error destroying window, attempting force close', e);
      try {
        distractionWindowRef.close();
        log('INFO', 'Successfully force closed distraction window');
      } catch (e2) {
        log('ERROR', 'Failed to force close window', e2);
      }
    }
    distractionWindowRef = null;
  } else {
    log('WARN', 'No distraction window to close or already destroyed');
  }

  // Send close command immediately if we have a tab ID
  if (tabToClose) {
    // Send close command multiple times to ensure delivery
    sendCloseTab(tabToClose, false);
    
    // Clear the ID after sending the command
    lastDistractionTabId = null;
    
    // Set a short timeout to verify the window is really gone
    setTimeout(() => {
      if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
        try {
          distractionWindowRef.destroy();
          distractionWindowRef = null;
        } catch (e) {}
      }
    }, 100);
  }
});
