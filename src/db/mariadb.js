// Connexion MariaDB + lecture des contacts/listes.
// Utilise mysql2 (promesses) avec pool de connexions.

const mysql = require('mysql2/promise');

let pool = null;
let currentConfig = null;

function buildPoolConfig(config) {
  return {
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 10000,
    charset: 'utf8mb4_unicode_ci',
  };
}

async function testConnection(config) {
  const tmpPool = mysql.createPool(buildPoolConfig(config));
  try {
    const conn = await tmpPool.getConnection();
    await conn.ping();
    conn.release();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await tmpPool.end().catch(() => {});
  }
}

async function connect(config) {
  await disconnect();
  pool = mysql.createPool(buildPoolConfig(config));
  currentConfig = config;
  // Vérifier la connexion immédiatement
  const conn = await pool.getConnection();
  conn.release();
  return { host: config.host, database: config.database };
}

async function disconnect() {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
    currentConfig = null;
  }
}

function isConnected() {
  return pool !== null;
}

function ensureConnected() {
  if (!pool) {
    throw new Error('Aucune connexion MariaDB active.');
  }
}

async function getListes() {
  ensureConnected();
  const [rows] = await pool.query('SELECT id, nom, description FROM listes ORDER BY nom');
  return rows;
}

async function getContacts() {
  ensureConnected();

  const [contacts] = await pool.query(`
    SELECT
      id, categorie, titre, prenom, nom, fonction, organisme,
      adresse, numero, code_postal, ville,
      telephone, gsm, fax, email,
      refus, notes,
      DATE_FORMAT(date_modification, '%d/%m/%Y') AS date_modification
    FROM contacts
    ORDER BY id
  `);

  const [links] = await pool.query(`
    SELECT cl.contact_id, l.nom
    FROM contact_listes cl
    JOIN listes l ON l.id = cl.liste_id
  `);

  const listesByContact = new Map();
  for (const link of links) {
    const existing = listesByContact.get(link.contact_id);
    if (existing) {
      existing.push(link.nom);
    } else {
      listesByContact.set(link.contact_id, [link.nom]);
    }
  }

  const rows = contacts.map((row) => {
    const listes = listesByContact.get(row.id) ?? [];
    const cleaned = { _id: row.id };
    for (const [key, value] of Object.entries(row)) {
      cleaned[key] = value === null || value === undefined ? '' : String(value);
    }
    cleaned.listes = listes.join(', ');
    return cleaned;
  });

  const columns = [
    'id',
    'categorie',
    'titre',
    'prenom',
    'nom',
    'fonction',
    'organisme',
    'adresse',
    'numero',
    'code_postal',
    'ville',
    'telephone',
    'gsm',
    'fax',
    'email',
    'refus',
    'date_modification',
    'listes',
    'notes',
  ];

  return { columns, rows };
}

module.exports = {
  testConnection,
  connect,
  disconnect,
  isConnected,
  getListes,
  getContacts,
};
