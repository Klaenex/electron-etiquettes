// Stockage chiffré des credentials MariaDB.
// Utilise safeStorage Electron (chiffrement OS-level : DPAPI sur Windows).

const fs = require('fs/promises');
const path = require('path');
const { app, safeStorage } = require('electron');

const FILENAME = 'mariadb-credentials.enc';

function getFilePath() {
  return path.join(app.getPath('userData'), FILENAME);
}

async function save(config) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Chiffrement indisponible sur ce système.");
  }
  const json = JSON.stringify(config);
  const encrypted = safeStorage.encryptString(json);
  await fs.writeFile(getFilePath(), encrypted);
}

async function load() {
  try {
    const encrypted = await fs.readFile(getFilePath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    const json = safeStorage.decryptString(encrypted);
    return JSON.parse(json);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function clear() {
  try {
    await fs.unlink(getFilePath());
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { save, load, clear };
