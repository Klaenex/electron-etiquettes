const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Fichier
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // Base de données
  loadDatabase: (filePath) => ipcRenderer.invoke('db:load', filePath),
  getTable: (filePath, tableName) => ipcRenderer.invoke('db:getTable', filePath, tableName),

  // Impression
  printLabels: (options) => ipcRenderer.invoke('print:labels', options),
  previewLabels: (htmlContent) => ipcRenderer.invoke('print:preview', htmlContent),
  exportExcel: (payload) => ipcRenderer.invoke('export:excel', payload),

  // Événements depuis le menu principal
  onMenuOpenFile: (callback) => {
    ipcRenderer.on('menu:openFile', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:openFile');
  },
});
