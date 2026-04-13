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
}) {
  return (
    <header className="toolbar">
      <button id="btn-open" onClick={onOpen} title="Ouvrir une base de donnees Access (Ctrl+O)">
        Ouvrir base de donnees
      </button>

      <span className="toolbar-sep" />

      <label className="toolbar-label" htmlFor="select-table">
        Table :
      </label>
      <select
        id="select-table"
        disabled={disabled}
        value={currentTable || ""}
        onChange={(event) => onChangeTable(event.target.value)}
      >
        {tables.length === 0 ? (
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

      <span className="toolbar-flex" />

      <span className={`status-bar ${isError ? "status-bar-error" : ""}`}>{status}</span>
    </header>
  );
}
