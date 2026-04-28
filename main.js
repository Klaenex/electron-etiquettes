const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const XLSX = require("xlsx");

let mainWindow;
const isDev = !app.isPackaged;
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
const rendererBuildPath = path.join(__dirname, "renderer", "dist", "index.html");

// Rechargement automatique en développement
if (isDev) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(__dirname, "node_modules", ".bin", "electron.cmd"),
      hardResetMethod: "exit",
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });
    console.log("[dev] electron-reload activé");
  } catch (err) {
    console.log("[dev] electron-reload non activé :", err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Étiquettes",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev && rendererDevUrl) {
    mainWindow.loadURL(rendererDevUrl);
  } else {
    mainWindow.loadFile(rendererBuildPath);
  }

  // Optionnel mais pratique pour ajuster la mise en page
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Menu minimal
  const menu = Menu.buildFromTemplate([
    {
      label: "Fichier",
      submenu: [
        {
          label: "Ouvrir une base de données…",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("menu:openFile");
            }
          },
        },
        { type: "separator" },
        {
          label: "Quitter",
          accelerator: "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { role: "reload", label: "Recharger" },
        { role: "forceReload", label: "Forcer le rechargement" },
        { role: "toggleDevTools", label: "Outils de développement" },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom normal" },
        { role: "zoomIn", label: "Zoom avant" },
        { role: "zoomOut", label: "Zoom arrière" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ──────────────────────────────────────────────────────────────

// Ouvrir le dialogue de sélection de fichier
ipcMain.handle("dialog:openFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Ouvrir une base de données Access",
    filters: [
      { name: "Base de données Access", extensions: ["mdb", "accdb"] },
      { name: "Tous les fichiers", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

// Charger la base de données
ipcMain.handle("db:load", async (_event, filePath) => {
  try {
    const { loadDatabase } = require("./src/db/reader");
    const data = await loadDatabase(filePath);
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Lire les données d'une table spécifique
ipcMain.handle("db:getTable", async (_event, filePath, tableName) => {
  try {
    const { getTableData } = require("./src/db/reader");
    const data = await getTableData(filePath, tableName);
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Imprimer les étiquettes
ipcMain.handle("print:labels", async (_event, options) => {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ success: false, error: "Fenêtre principale indisponible" });
      return;
    }

    mainWindow.webContents.print(
      {
        printBackground: false,
        margins: { marginType: "none" },
        pageSize: "A4",
        ...options,
        silent: false,
      },
      (success, failureReason) => {
        if (success) resolve({ success: true });
        else resolve({ success: false, error: failureReason });
      },
    );
  });
});

// MIGRATION ONE-SHOT — TODO: supprimer ce handler après bascule MariaDB
ipcMain.handle("db:exportSQL", async (_event, accessFilePath, tableName) => {
  try {
    const { exportToMariaDBSQL } = require("./src/db/sql-exporter");

    const baseName = path.basename(accessFilePath, path.extname(accessFilePath));
    const safeTable = String(tableName || "contacts").replace(/[<>:"/\\|?*]+/g, "_");
    const suggestedName = `${baseName}-${safeTable}.sql`;

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Préparer SQL pour MariaDB",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "Script SQL", extensions: ["sql"] }],
      properties: ["showOverwriteConfirmation"],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const result = await exportToMariaDBSQL(accessFilePath, filePath, tableName);
    return { success: true, filePath, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("db:exportSQLite", async (_event, accessFilePath) => {
  try {
    const { exportToSQLite } = require("./src/db/exporter");

    const baseName = path.basename(accessFilePath, path.extname(accessFilePath));
    const suggestedName = `${baseName}.db`;

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter vers SQLite",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "Base SQLite", extensions: ["db", "sqlite"] }],
      properties: ["showOverwriteConfirmation"],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const result = await exportToSQLite(accessFilePath, filePath);
    return { success: true, filePath, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("export:excel", async (_event, payload) => {
  try {
    const { rows = [], columns = [], tableName = "export" } = payload || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: "Aucune ligne a exporter." };
    }

    const suggestedName = `${String(tableName).replace(/[<>:\"/\\|?*]+/g, "_") || "export"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter la selection en Excel",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "Fichier Excel", extensions: ["xlsx"] }],
      properties: ["showOverwriteConfirmation"],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const exportRows = rows.map((row) => {
      const next = {};
      columns.forEach((column) => {
        next[column] = row[column] ?? "";
      });
      return next;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: columns });
    XLSX.utils.book_append_sheet(workbook, worksheet, String(tableName).slice(0, 31) || "Export");
    XLSX.writeFile(workbook, filePath);

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── MariaDB ───────────────────────────────────────────────────────────────────

ipcMain.handle("mariadb:test", async (_event, config) => {
  const { testConnection } = require("./src/db/mariadb");
  return testConnection(config);
});

ipcMain.handle("mariadb:connect", async (_event, payload) => {
  try {
    const { config, remember } = payload || {};
    const mariadb = require("./src/db/mariadb");
    const info = await mariadb.connect(config);
    let warning = null;

    if (remember) {
      const credentials = require("./src/storage/credentials");
      try {
        await credentials.save(config);
      } catch (err) {
        warning = `Connexion reussie, mais les identifiants n'ont pas ete sauvegardes : ${err.message}`;
      }
    }

    return { success: true, ...info, warning };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mariadb:disconnect", async () => {
  const mariadb = require("./src/db/mariadb");
  await mariadb.disconnect();
  return { success: true };
});

ipcMain.handle("mariadb:loadSavedCredentials", async () => {
  try {
    const credentials = require("./src/storage/credentials");
    const config = await credentials.load();
    return { success: true, config };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mariadb:clearSavedCredentials", async () => {
  try {
    const credentials = require("./src/storage/credentials");
    await credentials.clear();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mariadb:getContacts", async () => {
  try {
    const { getContacts } = require("./src/db/mariadb");
    const data = await getContacts();
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mariadb:getListes", async () => {
  try {
    const { getListes } = require("./src/db/mariadb");
    const listes = await getListes();
    return { success: true, listes };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// API HTTPS Infomaniak

ipcMain.handle("remoteApi:test", async (_event, config) => {
  const remoteApi = require("./src/api/remote");
  return remoteApi.testConnection(config);
});

ipcMain.handle("remoteApi:connect", async (_event, payload) => {
  try {
    const { config, remember } = payload || {};
    const remoteApi = require("./src/api/remote");
    const info = await remoteApi.connect(config);
    let warning = null;

    if (remember) {
      const credentials = require("./src/storage/api-credentials");
      try {
        await credentials.save(config);
      } catch (err) {
        warning = `Connexion reussie, mais le code n'a pas ete sauvegarde : ${err.message}`;
      }
    }

    return { success: true, ...info, warning };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("remoteApi:disconnect", async () => {
  const remoteApi = require("./src/api/remote");
  remoteApi.disconnect();
  return { success: true };
});

ipcMain.handle("remoteApi:loadSavedCredentials", async () => {
  try {
    const credentials = require("./src/storage/api-credentials");
    const config = await credentials.load();
    return { success: true, config };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("remoteApi:clearSavedCredentials", async () => {
  try {
    const credentials = require("./src/storage/api-credentials");
    await credentials.clear();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("remoteApi:getContacts", async () => {
  try {
    const remoteApi = require("./src/api/remote");
    const data = await remoteApi.getContacts();
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.on("before-quit", async () => {
  try {
    const mariadb = require("./src/db/mariadb");
    await mariadb.disconnect();
  } catch {
    // ignore
  }

  try {
    const remoteApi = require("./src/api/remote");
    remoteApi.disconnect();
  } catch {
    // ignore
  }
});
