// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Send a message to main process (fire-and-forget)
  sendToMain: (message) => ipcRenderer.send('toMain', message),

  // Send a message with a specific channel
  send: (channel, data) => ipcRenderer.send(channel, data),

  // Invoke a handler in main process and wait for response (Promise)
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // Listen to events from main process
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),

  // Remove listener
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback)
});
