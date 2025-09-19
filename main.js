// main.js - Enhanced with homework-dependent distraction blocking
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { startWebSocketServer, sendCloseTab } = require('./ws-server');
const { HomeworkChecker } = require('./homework-checker');
const { AssignmentManager } = require('./assignment-manager');

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
let homeworkWindow;
let assignmentWindow;
const DISTRACTION_KEYWORDS = ['youtube', 'instagram', 'tiktok', 'facebook', 'twitter', 'reddit'];
let lastDistraction = 0;
let lastDistractionTabId = null;
let distractionWindowRef = null;
const homeworkChecker = new HomeworkChecker();
const assignmentManager = new AssignmentManager();

// Distraction blocking state
let distractionBlockingEnabled = true;
let forceBlockMode = true; // Always block until homework is complete

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    alwaysOnTop: true,
    skipTaskbar: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
  
  // Update UI with current homework status
  mainWindow.webContents.on('did-finish-load', async () => {
    await updateHomeworkStatus();
  });
}

function createHomeworkWindow() {
  if (homeworkWindow && !homeworkWindow.isDestroyed()) {
    homeworkWindow.focus();
    return;
  }
  
  homeworkWindow = new BrowserWindow({
    width: 700,
    height: 600,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });
  
  homeworkWindow.loadFile('homework.html');
  homeworkWindow.on('closed', () => { homeworkWindow = null; });
}

function createAssignmentWindow() {
  if (assignmentWindow && !assignmentWindow.isDestroyed()) {
    assignmentWindow.focus();
    return;
  }
  
  assignmentWindow = new BrowserWindow({
    width: 600,
    height: 500,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });
  
  assignmentWindow.loadFile('assignments.html');
  assignmentWindow.on('closed', () => { assignmentWindow = null; });
}

function createDistractionWindow() {
  if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
    distractionWindowRef.focus();
    return distractionWindowRef;
  }
  
  distractionWindowRef = new BrowserWindow({
    width: 500,
    height: 400,
    alwaysOnTop: true,
    skipTaskbar: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  
  distractionWindowRef.on('closed', () => { distractionWindowRef = null; });
  
  // Create dynamic content based on homework status
  createDistractionContent();
  
  return distractionWindowRef;
}

async function createDistractionContent() {
  const pendingAssignments = await assignmentManager.getPendingAssignments();
  const completedCount = await assignmentManager.getCompletedCount();
  const totalCount = await assignmentManager.getTotalCount();
  
  const isAllComplete = pendingAssignments.length === 0 && totalCount > 0;
  
  let content;
  if (isAllComplete) {
    // All homework complete - allow user to continue with gentle reminder
    content = `
      <!DOCTYPE html>
      <html lang='en'>
      <head>
        <meta charset='UTF-8'>
        <title>Great Job!</title>
        <style>
          body { font-family: 'Inter', 'Segoe UI', sans-serif; background: linear-gradient(135deg, #10b981, #34d399); margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: white; }
          .container { text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 20px; backdrop-filter: blur(10px); }
          h2 { font-size: 2.5rem; margin-bottom: 20px; }
          p { font-size: 1.2rem; margin-bottom: 25px; line-height: 1.6; }
          .stats { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; margin: 20px 0; }
          button { margin: 10px; padding: 12px 24px; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: all 0.3s; }
          .continue-btn { background: #fff; color: #10b981; }
          .continue-btn:hover { background: #f0f0f0; transform: translateY(-2px); }
          .homework-btn { background: rgba(255,255,255,0.2); color: white; border: 2px solid white; }
          .homework-btn:hover { background: rgba(255,255,255,0.3); }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🎉 Excellent Work!</h2>
          <p>You've completed all your assignments!</p>
          <div class="stats">
            <strong>${completedCount}/${totalCount}</strong> assignments complete
          </div>
          <p>You've earned some free time. Use it wisely!</p>
          <button class="continue-btn" onclick="allowAccess()">Continue to Site</button>
          <button class="homework-btn" onclick="openHomework()">Check More Homework</button>
        </div>
        <script>
          function allowAccess() {
            window.electronAPI.allowTemporaryAccess();
          }
          function openHomework() {
            window.electronAPI.openHomeworkChecker();
            window.close();
          }
        </script>
      </body>
      </html>
    `;
  } else {
    // Homework incomplete - strict blocking
    const assignmentsList = pendingAssignments
      .map(a => `<li><strong>${a.title}</strong> - Due: ${new Date(a.dueDate).toLocaleDateString()}</li>`)
      .join('');
    
    content = `
      <!DOCTYPE html>
      <html lang='en'>
      <head>
        <meta charset='UTF-8'>
        <title>Complete Your Homework First!</title>
        <style>
          body { font-family: 'Inter', 'Segoe UI', sans-serif; background: linear-gradient(135deg, #dc2626, #ef4444); margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: white; }
          .container { text-align: center; padding: 40px; background: rgba(0,0,0,0.2); border-radius: 20px; backdrop-filter: blur(10px); max-width: 500px; }
          h2 { font-size: 2.5rem; margin-bottom: 20px; }
          p { font-size: 1.2rem; margin-bottom: 25px; line-height: 1.6; }
          .assignments { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 20px 0; text-align: left; }
          .assignments h3 { color: #fbbf24; margin-bottom: 15px; text-align: center; }
          .assignments ul { list-style: none; padding: 0; }
          .assignments li { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.2); }
          .assignments li:last-child { border-bottom: none; }
          .stats { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; margin: 20px 0; }
          button { margin: 10px; padding: 12px 24px; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: all 0.3s; }
          .homework-btn { background: #fbbf24; color: #1f2937; }
          .homework-btn:hover { background: #f59e0b; transform: translateY(-2px); }
          .assignments-btn { background: rgba(255,255,255,0.2); color: white; border: 2px solid white; }
          .assignments-btn:hover { background: rgba(255,255,255,0.3); }
          .no-access { font-size: 0.9rem; color: #fca5a5; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>📚 Homework First!</h2>
          <p>You have pending assignments that need to be completed before accessing distracting sites.</p>
          
          <div class="assignments">
            <h3>⏰ Pending Assignments (${pendingAssignments.length})</h3>
            <ul>${assignmentsList || '<li>No assignments listed yet. Add your assignments first!</li>'}</ul>
          </div>
          
          <div class="stats">
            <strong>${completedCount}/${totalCount}</strong> assignments complete
          </div>
          
          <button class="homework-btn" onclick="openHomework()">Check Homework</button>
          <button class="assignments-btn" onclick="manageAssignments()">Manage Assignments</button>
          
          <div class="no-access">
            🔒 Access will be restored once all assignments are marked complete.
          </div>
        </div>
        <script>
          function openHomework() {
            window.electronAPI.openHomeworkChecker();
          }
          function manageAssignments() {
            window.electronAPI.openAssignmentManager();
          }
          
          // Auto-refresh every 10 seconds to check for updates
          setInterval(() => {
            window.electronAPI.refreshDistractionStatus();
          }, 10000);
        </script>
      </body>
      </html>
    `;
  }
  
  distractionWindowRef.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(content)}`);
}

async function updateHomeworkStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  try {
    // Check if assignment manager is available
    if (!assignmentManager || typeof assignmentManager.getPendingAssignments !== 'function') {
      log('WARN', 'Assignment manager not available, using fallback status');
      mainWindow.webContents.send('homework-status-update', {
        pendingCount: 0,
        completedCount: 0,
        totalCount: 0,
        isAllComplete: true,
        canDisableBlocking: true
      });
      return;
    }

    const pendingAssignments = await assignmentManager.getPendingAssignments();
    const completedCount = await assignmentManager.getCompletedCount();
    const totalCount = await assignmentManager.getTotalCount();
    const isAllComplete = pendingAssignments.length === 0 && totalCount > 0;
    
    mainWindow.webContents.send('homework-status-update', {
      pendingCount: pendingAssignments.length,
      completedCount,
      totalCount,
      isAllComplete,
      canDisableBlocking: isAllComplete
    });
    
    log('INFO', 'Homework status updated', {
      pending: pendingAssignments.length,
      completed: completedCount,
      total: totalCount,
      allComplete: isAllComplete
    });
  } catch (error) {
    log('ERROR', 'Error updating homework status:', error);
    // Send fallback status on error
    mainWindow.webContents.send('homework-status-update', {
      pendingCount: 0,
      completedCount: 0,
      totalCount: 0,
      isAllComplete: true,
      canDisableBlocking: true,
      error: error.message
    });
  }
}

function promptExtensionInstall() {
  const extensionPath = `${__dirname}/extension`;
  setTimeout(() => {
    shell.openPath(extensionPath);
    mainWindow.webContents.executeJavaScript(`
      alert('For best results, please install the FocusTracker browser extension.\n\n1. Open Chrome and go to chrome://extensions/\n2. Enable Developer Mode (top right)\n3. Drag and drop the extension folder (which just opened) into the page.');
    `);
  }, 500);
}

app.whenReady().then(async () => {
  createWindow();
  promptExtensionInstall();
  
  // Initialize assignment manager with error handling
  try {
    await assignmentManager.init();
    log('INFO', 'Assignment manager initialized successfully');
  } catch (error) {
    log('ERROR', 'Failed to initialize assignment manager:', error);
    // Continue without assignment manager if it fails
  }
  
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

// Enhanced distraction detection - only block if homework incomplete
setInterval(async () => {
  try {
    // Check if all homework is complete
    let hasIncompleteHomework = false;
    
    try {
      if (assignmentManager && typeof assignmentManager.getPendingAssignments === 'function') {
        const pendingAssignments = await assignmentManager.getPendingAssignments();
        hasIncompleteHomework = pendingAssignments.length > 0;
      }
    } catch (assignmentError) {
      log('WARN', 'Assignment manager error, defaulting to no blocking:', assignmentError);
      hasIncompleteHomework = false; // Default to not blocking if assignment manager fails
    }
    
    // Only run distraction detection if homework is incomplete
    if (!hasIncompleteHomework) return;
    
    const getWindows = (await import('get-windows')).default;
    const windows = await getWindows();
    const active = windows.find(w => w.isFocused);
    if (!active) return;
    
    const title = (active.title || '').toLowerCase();
    const appName = (active.app || '').toLowerCase();
    const isDistracted = DISTRACTION_KEYWORDS.some(keyword => title.includes(keyword) || appName.includes(keyword));
    
    if (isDistracted && Date.now() - lastDistraction > 5000) {
      lastDistraction = Date.now();
      createDistractionWindow();
    }
  } catch (e) {
    // Ignore errors in distraction detection to prevent crashes
    log('WARN', 'Distraction detection error:', e);
  }
}, 3000); // Check more frequently

// IPC handlers for assignment management
ipcMain.on('open-assignment-manager', () => {
  log('IPC', 'Received open-assignment-manager message');
  createAssignmentWindow();
});

ipcMain.handle('add-assignment', async (event, assignment) => {
  try {
    log('IPC', 'Adding assignment:', assignment);
    const result = await assignmentManager.addAssignment(assignment);
    await updateHomeworkStatus();
    return result;
  } catch (error) {
    log('ERROR', 'Error adding assignment:', error);
    throw error;
  }
});

ipcMain.handle('get-assignments', async () => {
  try {
    log('IPC', 'Getting assignments');
    return await assignmentManager.getAllAssignments();
  } catch (error) {
    log('ERROR', 'Error getting assignments:', error);
    return [];
  }
});

ipcMain.handle('update-assignment', async (event, assignmentId, updates) => {
  try {
    log('IPC', 'Updating assignment:', { assignmentId, updates });
    const result = await assignmentManager.updateAssignment(assignmentId, updates);
    await updateHomeworkStatus();
    return result;
  } catch (error) {
    log('ERROR', 'Error updating assignment:', error);
    throw error;
  }
});

ipcMain.handle('delete-assignment', async (event, assignmentId) => {
  try {
    log('IPC', 'Deleting assignment:', assignmentId);
    const result = await assignmentManager.deleteAssignment(assignmentId);
    await updateHomeworkStatus();
    return result;
  } catch (error) {
    log('ERROR', 'Error deleting assignment:', error);
    throw error;
  }
});

ipcMain.handle('mark-assignment-complete', async (event, assignmentId) => {
  try {
    log('IPC', 'Marking assignment complete:', assignmentId);
    const result = await assignmentManager.markComplete(assignmentId);
    await updateHomeworkStatus();
    return result;
  } catch (error) {
    log('ERROR', 'Error marking assignment complete:', error);
    throw error;
  }
});

// IPC handlers for homework functionality
ipcMain.on('open-homework-checker', () => {
  createHomeworkWindow();
});

ipcMain.handle('select-homework-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Supported', extensions: ['pdf', 'docx', 'pptx', 'jpg', 'jpeg', 'png'] },
      { name: 'Documents', extensions: ['pdf', 'docx', 'pptx'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('check-homework-completion', async (event, filePath, assignmentId = null) => {
  try {
    log('INFO', 'Checking homework completion for file:', filePath);
    const result = await homeworkChecker.checkFile(filePath);
    
    // If homework is complete and linked to an assignment, mark it complete
    if (result.isComplete && assignmentId) {
      await assignmentManager.markComplete(assignmentId);
      await updateHomeworkStatus();
    }
    
    log('INFO', 'Homework check result:', result);
    return result;
  } catch (error) {
    log('ERROR', 'Error checking homework:', error);
    return {
      isComplete: false,
      wordCount: 0,
      error: error.message
    };
  }
});

ipcMain.handle('get-homework-history', async () => {
  try {
    return await homeworkChecker.getHistory();
  } catch (error) {
    log('ERROR', 'Error getting homework history:', error);
    return [];
  }
});

// Distraction control handlers
ipcMain.on('allow-temporary-access', () => {
  log('INFO', 'Temporary access granted - all homework complete');
  if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
    distractionWindowRef.close();
    distractionWindowRef = null;
  }
  // Grant 30 minutes of access
  setTimeout(() => {
    log('INFO', 'Temporary access expired');
  }, 30 * 60 * 1000);
});

// Legacy distraction handlers (modified to respect homework status)
ipcMain.on('remind-again', async () => {
  log('IPC', 'Received remind-again message');
  try {
    const pendingAssignments = await assignmentManager.getPendingAssignments();
    if (pendingAssignments.length > 0) {
      setTimeout(() => {
        createDistractionWindow();
      }, 30000);
    }
  } catch (error) {
    log('ERROR', 'Error in remind-again handler:', error);
    // Fallback to original behavior
    setTimeout(() => {
      createDistractionWindow();
    }, 30000);
  }
});

ipcMain.on('freeze-distraction-tab', () => {
  log('IPC', 'Received freeze-distraction-tab message', { tabId: lastDistractionTabId });
  if (lastDistractionTabId) {
    sendCloseTab(lastDistractionTabId, true);
  } else {
    log('WARN', 'No tab ID available for freezing');
  }
});

ipcMain.on('close-distraction-tab', async () => {
  const tabToClose = lastDistractionTabId;
  log('IPC', 'Received close-distraction-tab message', { tabId: tabToClose });
  
  try {
    const pendingAssignments = await assignmentManager.getPendingAssignments();
    
    // Only allow closing if homework is complete
    if (pendingAssignments.length === 0) {
      log('IPC', 'Allowing tab close - homework complete', { tabId: tabToClose });
      
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
      }
      
      if (tabToClose) {
        sendCloseTab(tabToClose, false);
        lastDistractionTabId = null;
        
        setTimeout(() => {
          if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
            try {
              distractionWindowRef.destroy();
              distractionWindowRef = null;
            } catch (e) {}
          }
        }, 100);
      }
    } else {
      log('IPC', 'Tab close denied - homework incomplete', { pendingCount: pendingAssignments.length });
      // Refresh the distraction window to show current status
      if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
        await createDistractionContent();
      }
    }
  } catch (error) {
    log('ERROR', 'Error in close-distraction-tab handler:', error);
    // Fallback to original behavior if assignment manager fails
    if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
      try {
        distractionWindowRef.destroy();
        distractionWindowRef = null;
      } catch (e) {
        try {
          distractionWindowRef.close();
        } catch (e2) {
          log('ERROR', 'Failed to close window', e2);
        }
      }
    }
    
    if (tabToClose) {
      sendCloseTab(tabToClose, false);
      lastDistractionTabId = null;
    }
  }
});

ipcMain.on('refresh-distraction-status', async () => {
  if (distractionWindowRef && !distractionWindowRef.isDestroyed()) {
    await createDistractionContent();
  }
});

ipcMain.on('request-homework-status', async () => {
  await updateHomeworkStatus();
});