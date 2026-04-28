const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Fichier
  openFile: () => ipcRenderer.invoke("dialog:openFile"),

  // Base de donnees Access
  loadDatabase: (filePath) => ipcRenderer.invoke("db:load", filePath),
  getTable: (filePath, tableName) => ipcRenderer.invoke("db:getTable", filePath, tableName),

  // Impression et exports
  printLabels: (options) => ipcRenderer.invoke("print:labels", options),
  exportExcel: (payload) => ipcRenderer.invoke("export:excel", payload),
  exportSQLite: (filePath) => ipcRenderer.invoke("db:exportSQLite", filePath),
  exportSQL: (filePath, tableName) => ipcRenderer.invoke("db:exportSQL", filePath, tableName),

  // MariaDB direct, conserve pour debug ou serveur cloud.
  mariadb: {
    test: (config) => ipcRenderer.invoke("mariadb:test", config),
    connect: (config, remember) => ipcRenderer.invoke("mariadb:connect", { config, remember }),
    disconnect: () => ipcRenderer.invoke("mariadb:disconnect"),
    loadSavedCredentials: () => ipcRenderer.invoke("mariadb:loadSavedCredentials"),
    clearSavedCredentials: () => ipcRenderer.invoke("mariadb:clearSavedCredentials"),
    getContacts: () => ipcRenderer.invoke("mariadb:getContacts"),
    getListes: () => ipcRenderer.invoke("mariadb:getListes"),
  },

  // API HTTPS Infomaniak.
  remoteApi: {
    test: (config) => ipcRenderer.invoke("remoteApi:test", config),
    connect: (config, remember) => ipcRenderer.invoke("remoteApi:connect", { config, remember }),
    disconnect: () => ipcRenderer.invoke("remoteApi:disconnect"),
    loadSavedCredentials: () => ipcRenderer.invoke("remoteApi:loadSavedCredentials"),
    clearSavedCredentials: () => ipcRenderer.invoke("remoteApi:clearSavedCredentials"),
    getContacts: () => ipcRenderer.invoke("remoteApi:getContacts"),
  },

  // Evenements depuis le menu principal
  onMenuOpenFile: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu:openFile", handler);
    return () => ipcRenderer.removeListener("menu:openFile", handler);
  },
});
