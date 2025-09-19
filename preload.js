// preload.js - Enhanced with homework-dependent functionality
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Distraction blocking APIs
  onDistraction: (callback) => ipcRenderer.on('distraction-detected', callback),
  remindAgain: () => ipcRenderer.send('remind-again'),
  closeDistractionTab: () => ipcRenderer.send('close-distraction-tab'),
  freezeDistractionTab: () => ipcRenderer.send('freeze-distraction-tab'),
  allowTemporaryAccess: () => ipcRenderer.send('allow-temporary-access'),
  refreshDistractionStatus: () => ipcRenderer.send('refresh-distraction-status'),
  
  // Generic message sender for backward compatibility
  sendMessage: (channel) => {
    const validChannels = [
      'close-distraction-tab', 
      'freeze-distraction-tab', 
      'remind-again',
      'allow-temporary-access',
      'refresh-distraction-status'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  },
  
  // Legacy send method
  send: (channel) => {
    const validChannels = [
      'close-distraction-tab', 
      'freeze-distraction-tab', 
      'remind-again',
      'allow-temporary-access',
      'refresh-distraction-status'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  },
  
  // Homework checker APIs
  openHomeworkChecker: () => ipcRenderer.send('open-homework-checker'),
  selectHomeworkFile: () => ipcRenderer.invoke('select-homework-file'),
  checkHomeworkCompletion: (filePath, assignmentId = null) => 
    ipcRenderer.invoke('check-homework-completion', filePath, assignmentId),
  getHomeworkHistory: () => ipcRenderer.invoke('get-homework-history'),
  
  // Assignment management APIs
  openAssignmentManager: () => ipcRenderer.send('open-assignment-manager'),
  addAssignment: (assignment) => ipcRenderer.invoke('add-assignment', assignment),
  getAssignments: () => ipcRenderer.invoke('get-assignments'),
  updateAssignment: (assignmentId, updates) => 
    ipcRenderer.invoke('update-assignment', assignmentId, updates),
  deleteAssignment: (assignmentId) => ipcRenderer.invoke('delete-assignment', assignmentId),
  markAssignmentComplete: (assignmentId) => 
    ipcRenderer.invoke('mark-assignment-complete', assignmentId),
  
  // Homework status monitoring
  onHomeworkStatusUpdate: (callback) => 
    ipcRenderer.on('homework-status-update', (event, status) => callback(status)),
  requestHomeworkStatus: () => ipcRenderer.send('request-homework-status'),
  
  // Settings APIs (for future use)
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings')
});