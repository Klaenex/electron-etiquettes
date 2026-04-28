export default function Toolbar({
  onOpen,
  tables,
  currentTable,
  onChangeTable,
  globalSearch,
  onChangeSearch,
  disabled,
  status,
  isError,
  onExportSQLite,
  onExportSQL,
  sourceMode,
  serverInfo,
  canExportAccess,
  onOpenServer,
  onDisconnectServer,
  onRefreshServer,
}) {
  const isServerMode = sourceMode === "server";
  const serverLabel = serverInfo ? `${serverInfo.database}` : "non connecte";

  return (
    <header className="toolbar">
      <button id="btn-open" onClick={onOpen} title="Ouvrir une base de donnees Access (Ctrl+O)">
        Ouvrir Access
      </button>

      <button onClick={onOpenServer} title="Configurer la connexion">
        {serverInfo ? "Changer connexion" : "Connexion"}
      </button>

      {serverInfo && (
        <>
          <button onClick={onRefreshServer} title="Recharger les contacts">
            Actualiser
          </button>
          <button onClick={onDisconnectServer} title="Fermer la connexion">
            Deconnecter
          </button>
        </>
      )}

      {canExportAccess && (
        <>
          <span className="toolbar-sep" />
          <button onClick={onExportSQLite} title="Exporter toute la base Access vers un fichier SQLite (.db)">
            Exporter SQLite
          </button>
          {/* MIGRATION ONE-SHOT - TODO: supprimer apres bascule MariaDB */}
          <button
            onClick={onExportSQL}
            title="Generer un script .sql pour importer dans MariaDB (migration one-shot)"
          >
            Preparer SQL MariaDB
          </button>
        </>
      )}

      <span className="toolbar-sep" />

      <label className="toolbar-label" htmlFor="select-table">
        Table :
      </label>
      <select
        id="select-table"
        disabled={disabled || isServerMode}
        value={currentTable || ""}
        onChange={(event) => onChangeTable(event.target.value)}
      >
        {isServerMode ? (
          <option value={currentTable || "contacts"}>Contacts</option>
        ) : tables.length === 0 ? (
          <option value="">Aucune base chargee</option>
        ) : (
          tables.map((table) => (
            <option key={table} value={table}>
              {table}
            </option>
          ))
        )}
      </select>

      <span className="toolbar-sep" />

      <input
        id="search-global"
        type="search"
        placeholder="Rechercher..."
        disabled={disabled}
        value={globalSearch}
        onChange={(event) => onChangeSearch(event.target.value)}
      />

      {isServerMode && <span className="connection-pill">API : {serverLabel}</span>}

      <span className="toolbar-flex" />

      <span className={`status-bar ${isError ? "status-bar-error" : ""}`}>{status}</span>
    </header>
  );
}
