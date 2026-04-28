const fs = require("fs/promises");
const path = require("path");
const { app, safeStorage } = require("electron");

const FILENAME = "api-credentials.enc";

function getFilePath() {
  return path.join(app.getPath("userData"), FILENAME);
}

async function save(config) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Chiffrement indisponible sur ce systeme.");
  }

  const encrypted = safeStorage.encryptString(JSON.stringify(config));
  await fs.writeFile(getFilePath(), encrypted);
}

async function load() {
  try {
    const encrypted = await fs.readFile(getFilePath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function clear() {
  try {
    await fs.unlink(getFilePath());
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { save, load, clear };
