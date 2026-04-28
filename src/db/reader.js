/**
 * reader.js — Lecture de fichiers Microsoft Access (.mdb / .accdb)
 * Utilise le package `mdb-reader` (pure JS, sans ODBC).
 */

const fs = require('fs/promises');

let MDBReaderCtor = null;
async function getMDBReader() {
  if (MDBReaderCtor) return MDBReaderCtor;
  const mod = await import('mdb-reader');
  MDBReaderCtor = mod.default ?? mod.MDBReader ?? mod;
  return MDBReaderCtor;
}

// Cache : un MDBReader par fichier, invalidé si mtime change.
const readerCache = new Map();

async function getReader(filePath) {
  const stat = await fs.stat(filePath);
  const cached = readerCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.reader;
  }

  const Ctor = await getMDBReader();
  const buffer = await fs.readFile(filePath);
  const reader = new Ctor(buffer);
  readerCache.set(filePath, { reader, mtimeMs: stat.mtimeMs });
  return reader;
}

async function loadDatabase(filePath) {
  const reader = await getReader(filePath);
  const tables = reader.getTableNames({ normalTables: true, systemTables: false });
  return { tables };
}

async function getTableData(filePath, tableName) {
  const reader = await getReader(filePath);
  const table = reader.getTable(tableName);

  const columns = table.getColumnNames();
  const rows = table.getData();

  const cleanRows = rows.map((row, idx) => {
    const cleaned = { _id: idx };
    for (const col of columns) {
      const val = row[col];
      if (val === null || val === undefined) {
        cleaned[col] = '';
      } else if (val instanceof Date) {
        cleaned[col] = val.toLocaleDateString('fr-FR');
      } else {
        cleaned[col] = String(val);
      }
    }
    return cleaned;
  });

  return { columns, rows: cleanRows };
}

module.exports = { loadDatabase, getTableData, getReader };
