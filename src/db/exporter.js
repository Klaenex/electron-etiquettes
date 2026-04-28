/**
 * exporter.js — Export d'une base Access (.mdb/.accdb) vers SQLite (.db)
 * Utilise mdb-reader pour la lecture et better-sqlite3 pour l'écriture.
 * Toutes les colonnes sont exportées en TEXT (SQLite est typeless-friendly).
 */

const Database = require('better-sqlite3');
const { getReader } = require('./reader');

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toLocaleDateString('fr-FR');
  return typeof val === 'string' ? val : String(val);
}

async function exportToSQLite(accessFilePath, sqliteFilePath) {
  const reader = await getReader(accessFilePath);
  const tables = reader.getTableNames({ normalTables: true, systemTables: false });

  const db = new Database(sqliteFilePath);
  db.pragma('journal_mode = WAL');

  let totalRows = 0;

  try {
    for (const tableName of tables) {
      const table = reader.getTable(tableName);
      const columns = table.getColumnNames();

      if (columns.length === 0) continue;

      const colDefs = columns.map((col) => `${quoteIdent(col)} TEXT`).join(', ');
      db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (${colDefs})`);

      const rows = table.getData();
      if (rows.length === 0) continue;

      const colNames = columns.map(quoteIdent).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(
        `INSERT INTO ${quoteIdent(tableName)} (${colNames}) VALUES (${placeholders})`,
      );

      const insertAll = db.transaction((allRows) => {
        for (const row of allRows) {
          stmt.run(columns.map((col) => normalizeValue(row[col])));
        }
      });

      insertAll(rows);
      totalRows += rows.length;
    }
  } finally {
    db.close();
  }

  return { tableCount: tables.length, rowCount: totalRows };
}

module.exports = { exportToSQLite };
