const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Étiquettes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Menu minimal
  const menu = Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir une base de données…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:openFile'),
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ──────────────────────────────────────────────────────────────

// Ouvrir le dialogue de sélection de fichier
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir une base de données Access',
    filters: [
      { name: 'Base de données Access', extensions: ['mdb', 'accdb'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

// Charger la base de données
ipcMain.handle('db:load', async (_event, filePath) => {
  try {
    const { loadDatabase } = require('./src/db/reader');
    const data = await loadDatabase(filePath);
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Lire les données d'une table spécifique
ipcMain.handle('db:getTable', async (_event, filePath, tableName) => {
  try {
    const { getTableData } = require('./src/db/reader');
    const data = await getTableData(filePath, tableName);
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Imprimer les étiquettes
ipcMain.handle('print:labels', async (_event, options) => {
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: false,
        printBackground: false,
        margins: { marginType: 'none' },
        pageSize: 'A4',
        ...options,
      },
      (success, failureReason) => {
        if (success) resolve({ success: true });
        else resolve({ success: false, error: failureReason });
      }
    );
  });
});

// Aperçu avant impression (ouvre une fenêtre dédiée)
ipcMain.handle('print:preview', async (_event, htmlContent) => {
  const previewWin = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Aperçu impression',
    parent: mainWindow,
    modal: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const tmpPath = path.join(app.getPath('temp'), 'etiquettes-preview.html');
  fs.writeFileSync(tmpPath, htmlContent, 'utf8');
  previewWin.loadFile(tmpPath);

  return { success: true };
});
