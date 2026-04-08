/**
 * reader.js — Lecture de fichiers Microsoft Access (.mdb / .accdb)
 * Utilise le package `mdb-reader` (pure JS, sans ODBC).
 */

const fs = require('fs');

// mdb-reader v3+ est un module ESM — on utilise import() dynamique
async function getMDBReader() {
  const mod = await import('mdb-reader');
  return mod.default ?? mod.MDBReader ?? mod;
}

/**
 * Charge une base de données Access et retourne la liste de ses tables.
 * @param {string} filePath Chemin absolu vers le fichier .mdb/.accdb
 * @returns {{ tables: string[] }}
 */
async function loadDatabase(filePath) {
  const MDBReader = await getMDBReader();
  const buffer = fs.readFileSync(filePath);
  const reader = new MDBReader(buffer);
  const tables = reader.getTableNames({ normalTables: true, systemTables: false });
  return { tables };
}

/**
 * Lit toutes les données d'une table.
 * @param {string} filePath Chemin absolu vers le fichier .mdb/.accdb
 * @param {string} tableName Nom de la table à lire
 * @returns {{ columns: string[], rows: object[] }}
 */
async function getTableData(filePath, tableName) {
  const MDBReader = await getMDBReader();
  const buffer = fs.readFileSync(filePath);
  const reader = new MDBReader(buffer);
  const table = reader.getTable(tableName);

  const columns = table.getColumnNames();
  const rows = table.getData();

  // Nettoyer les valeurs : convertir null/undefined en chaîne vide,
  // convertir les dates en chaîne lisible
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

module.exports = { loadDatabase, getTableData };
