const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onDistraction: (callback) => ipcRenderer.on('distraction-detected', callback),
  remindAgain: () => ipcRenderer.send('remind-again'),
  closeDistractionTab: () => ipcRenderer.send('close-distraction-tab'),
  freezeDistractionTab: () => ipcRenderer.send('freeze-distraction-tab'),
  // Add the missing sendMessage method that the distraction window expects
  sendMessage: (channel) => {
    const validChannels = ['close-distraction-tab', 'freeze-distraction-tab', 'remind-again'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
      console.log(`Sent IPC message: ${channel}`);
    } else {
      console.error(`Invalid channel: ${channel}`);
    }
  },
  send: (channel) => {
    const validChannels = ['close-distraction-tab', 'freeze-distraction-tab', 'remind-again'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  }
});