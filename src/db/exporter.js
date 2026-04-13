/**
 * exporter.js — Export d'une base Access (.mdb/.accdb) vers SQLite (.db)
 * Utilise mdb-reader pour la lecture et better-sqlite3 pour l'écriture.
 * Toutes les colonnes sont exportées en TEXT (SQLite est typeless-friendly).
 */

const Database = require('better-sqlite3');
const { loadDatabase, getTableData } = require('./reader');

/**
 * Échappe un identifiant SQL (nom de table ou colonne).
 * @param {string} name
 * @returns {string}
 */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Exporte toutes les tables d'une base Access vers un fichier SQLite.
 * @param {string} accessFilePath  Chemin vers le fichier .mdb/.accdb
 * @param {string} sqliteFilePath  Chemin de destination pour le .db
 * @returns {{ tableCount: number, rowCount: number }}
 */
async function exportToSQLite(accessFilePath, sqliteFilePath) {
  const { tables } = await loadDatabase(accessFilePath);

  const db = new Database(sqliteFilePath);

  db.pragma('journal_mode = WAL');

  let totalRows = 0;

  for (const tableName of tables) {
    const { columns, rows } = await getTableData(accessFilePath, tableName);

    if (columns.length === 0) {
      continue;
    }

    const colDefs = columns.map((col) => `${quoteIdent(col)} TEXT`).join(', ');
    db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (${colDefs})`);

    if (rows.length > 0) {
      const colNames = columns.map(quoteIdent).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(
        `INSERT INTO ${quoteIdent(tableName)} (${colNames}) VALUES (${placeholders})`,
      );

      const insertAll = db.transaction((allRows) => {
        for (const row of allRows) {
          stmt.run(columns.map((col) => row[col] ?? null));
        }
      });

      insertAll(rows);
      totalRows += rows.length;
    }
  }

  db.close();

  return { tableCount: tables.length, rowCount: totalRows };
}

module.exports = { exportToSQLite };
