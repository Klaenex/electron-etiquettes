const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
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
        silent: false,
        printBackground: false,
        margins: { marginType: "none" },
        pageSize: "A4",
        ...options,
      },
      (success, failureReason) => {
        if (success) resolve({ success: true });
        else resolve({ success: false, error: failureReason });
      },
    );
  });
});

// Aperçu avant impression (ouvre une fenêtre dédiée)
ipcMain.handle("print:preview", async (_event, htmlContent) => {
  try {
    const previewWin = new BrowserWindow({
      width: 900,
      height: 700,
      title: "Aperçu impression",
      parent: mainWindow,
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tmpPath = path.join(app.getPath("temp"), "etiquettes-preview.html");
    fs.writeFileSync(tmpPath, htmlContent, "utf8");
    await previewWin.loadFile(tmpPath);

    if (isDev) {
      previewWin.webContents.openDevTools({ mode: "detach" });
    }

    return { success: true };
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
