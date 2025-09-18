const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onDistraction: (callback) => ipcRenderer.on('distraction-detected', callback),
  remindAgain: () => ipcRenderer.send('remind-again'),
  closeDistractionTab: () => ipcRenderer.send('close-distraction-tab'),
  freezeDistractionTab: () => ipcRenderer.send('freeze-distraction-tab'),
  send: (channel) => {
    const validChannels = ['close-distraction-tab', 'freeze-distraction-tab', 'remind-again'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  }
});
