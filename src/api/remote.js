let currentConfig = null;

const CONTACT_COLUMNS = [
  "id",
  "categorie",
  "titre",
  "prenom",
  "nom",
  "fonction",
  "organisme",
  "adresse",
  "numero",
  "code_postal",
  "ville",
  "telephone",
  "gsm",
  "fax",
  "email",
  "refus",
  "date_modification",
  "listes",
  "notes",
];

function normalizeBaseUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    throw new Error("URL API manquante.");
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:") {
    throw new Error("L'API doit utiliser HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizeConfig(config) {
  return {
    url: normalizeBaseUrl(config?.url),
    apiKey: String(config?.apiKey || "").trim(),
  };
}

async function request(action, config = currentConfig) {
  const activeConfig = normalizeConfig(config);

  if (!activeConfig.apiKey) {
    throw new Error("Code d'acces manquant.");
  }

  const url = new URL(activeConfig.url);
  url.searchParams.set("action", action);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": activeConfig.apiKey,
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Reponse API invalide (${response.status}).`);
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Erreur API HTTP ${response.status}.`);
  }

  return payload;
}

async function testConnection(config) {
  try {
    const payload = await request("ping", config);
    return {
      success: true,
      name: payload.name || "API Infomaniak",
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function connect(config) {
  const normalized = normalizeConfig(config);
  const payload = await request("ping", normalized);
  currentConfig = normalized;
  return {
    url: normalized.url,
    name: payload.name || "API Infomaniak",
  };
}

function disconnect() {
  currentConfig = null;
}

function ensureConnected() {
  if (!currentConfig) {
    throw new Error("Aucune connexion API active.");
  }
}

async function getContacts() {
  ensureConnected();
  const payload = await request("contacts");
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const columns = Array.isArray(payload.columns) && payload.columns.length > 0
    ? payload.columns
    : CONTACT_COLUMNS;

  return {
    columns,
    rows: rows.map((row, index) => {
      const id = row.id ?? row._id ?? index;
      const cleaned = { _id: id };

      for (const column of columns) {
        const value = row[column];
        cleaned[column] = value === null || value === undefined ? "" : String(value);
      }

      return cleaned;
    }),
  };
}

module.exports = {
  testConnection,
  connect,
  disconnect,
  getContacts,
};
