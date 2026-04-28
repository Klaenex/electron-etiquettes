import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "./components/EmptyState";
import PreviewModal from "./components/PreviewModal";
import RecordsTable from "./components/RecordsTable";
import ServerConnectionModal from "./components/ServerConnectionModal";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import { buildPreviewHTML, buildPrintHTML, getPageCount, resolveLabelLayout } from "./lib/labels";

const DATA_SOURCE_LOCAL = "local";
const DATA_SOURCE_SERVER = "server";
const SERVER_TABLE_NAME = "contacts";
const FILTERABLE_COLUMNS = ["categorie", "ville", "code postal", "bdl", "listes"];
const MULTI_SELECT_FILTER_COLUMNS = ["categorie", "listes"];
const COLUMN_VALUE_LABELS = {
  bdl: { "-1": "Oui (reçoit le BDL)", "0": "Non" },
};
const SEARCH_DEBOUNCE_MS = 250;

const electronAPI = window.electronAPI;

function normalizeFilterName(value) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function normalizeFilterValue(value) {
  return String(value ?? "").trim();
}

function getFilterValues(value, normalizedColumnName) {
  const text = normalizeFilterValue(value);
  if (!text) return [];

  if (normalizedColumnName === "listes") {
    return text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [text];
}

function cellText(row, column) {
  const value = row?.[column];
  return value == null ? "" : String(value);
}

function buildStatus({ currentTable, total, filtered, selected, message }) {
  if (message) {
    return message;
  }

  let next = `${total} enregistrement(s)`;

  if (filtered < total) {
    next += ` - ${filtered} affiche(s)`;
  }

  if (selected > 0) {
    next += ` - ${selected} selectionne(s)`;
  }

  return currentTable ? `[${currentTable}] ${next}` : next;
}

export default function App() {
  const [filePath, setFilePath] = useState(null);
  const [sourceMode, setSourceMode] = useState(DATA_SOURCE_LOCAL);
  const [serverInfo, setServerInfo] = useState(null);
  const [tables, setTables] = useState([]);
  const [currentTable, setCurrentTable] = useState("");
  const [columns, setColumns] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [columnFilters, setColumnFilters] = useState({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [statusMessage, setStatusMessage] = useState(
    electronAPI ? "Aucune source de donnees ouverte" : "electronAPI indisponible (lancez via Electron).",
  );
  const [isError, setIsError] = useState(!electronAPI);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [printMarkup, setPrintMarkup] = useState("");

  const tableCacheRef = useRef(new Map());

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(globalSearch), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [globalSearch]);

  const filterColumns = useMemo(() => {
    return columns
      .filter((column) => FILTERABLE_COLUMNS.includes(normalizeFilterName(column)))
      .map((column) => {
        const normalizedName = normalizeFilterName(column);
        return {
          name: column,
          isMultiSelect: MULTI_SELECT_FILTER_COLUMNS.includes(normalizedName),
          valueLabels: COLUMN_VALUE_LABELS[normalizedName] ?? {},
          values: [
            ...new Set(
              allRecords.flatMap((row) => getFilterValues(row[column], normalizedName)),
            ),
          ].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        };
      });
  }, [allRecords, columns]);

  const labelLayout = useMemo(() => resolveLabelLayout(columns), [columns]);

  const filteredRecords = useMemo(() => {
    let rows = allRecords;

    const query = debouncedSearch.trim().toLowerCase();
    if (query) {
      rows = rows.filter((row) =>
        columns.some((column) => cellText(row, column).toLowerCase().includes(query)),
      );
    }

    for (const [column, value] of Object.entries(columnFilters)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }

        const allowedValues = new Set(value.map((item) => normalizeFilterValue(item).toLowerCase()));
        const normalizedColumnName = normalizeFilterName(column);
        rows = rows.filter((row) =>
          getFilterValues(row[column], normalizedColumnName).some((item) =>
            allowedValues.has(item.toLowerCase()),
          ),
        );
        continue;
      }

      if (!value) {
        continue;
      }

      const filterQuery = normalizeFilterValue(value).toLowerCase();
      rows = rows.filter((row) =>
        normalizeFilterValue(row[column]).toLowerCase().includes(filterQuery),
      );
    }

    if (sortCol) {
      const direction = sortDir === "asc" ? 1 : -1;
      rows = [...rows].sort(
        (left, right) =>
          cellText(left, sortCol).localeCompare(cellText(right, sortCol), "fr", { sensitivity: "base" }) *
          direction,
      );
    }

    return rows;
  }, [allRecords, columnFilters, columns, debouncedSearch, sortCol, sortDir]);

  const selectedRecords = useMemo(() => {
    return filteredRecords.filter((record) => selected.has(record._id));
  }, [filteredRecords, selected]);

  const previewHtml = useMemo(() => {
    return buildPreviewHTML(selectedRecords, labelLayout);
  }, [labelLayout, selectedRecords]);

  const statusText = useMemo(() => {
    return buildStatus({
      currentTable,
      total: allRecords.length,
      filtered: filteredRecords.length,
      selected: selected.size,
      message: statusMessage,
    });
  }, [allRecords.length, currentTable, filteredRecords.length, selected.size, statusMessage]);

  const resetView = useCallback(() => {
    setSelected(new Set());
    setColumnFilters({});
    setGlobalSearch("");
    setDebouncedSearch("");
    setSortCol(null);
    setSortDir("asc");
  }, []);

  const clearRecords = useCallback(
    (message) => {
      tableCacheRef.current.clear();
      setFilePath(null);
      setTables([]);
      setCurrentTable("");
      setColumns([]);
      setAllRecords([]);
      resetView();
      setStatusMessage(message);
      setIsError(false);
    },
    [resetView],
  );

  const loadTable = useCallback(
    async (activeFilePath, tableName) => {
      if (!tableName || !electronAPI) {
        return;
      }

      const cacheKey = `${activeFilePath}\n${tableName}`;
      const cached = tableCacheRef.current.get(cacheKey);

      if (cached) {
        setCurrentTable(tableName);
        setColumns(cached.columns);
        setAllRecords(cached.rows);
        resetView();
        setStatusMessage("");
        setIsError(false);
        return;
      }

      setStatusMessage(`Chargement de la table "${tableName}"...`);
      setIsError(false);

      const result = await electronAPI.getTable(activeFilePath, tableName);

      if (!result.success) {
        setStatusMessage(`Erreur : ${result.error}`);
        setIsError(true);
        return;
      }

      tableCacheRef.current.set(cacheKey, { columns: result.columns, rows: result.rows });

      setCurrentTable(tableName);
      setColumns(result.columns);
      setAllRecords(result.rows);
      resetView();
      setStatusMessage("");
      setIsError(false);
    },
    [resetView],
  );

  const loadServerContacts = useCallback(
    async (info) => {
      if (!electronAPI?.remoteApi) {
        const error = "API distante indisponible dans le renderer.";
        setStatusMessage(error);
        setIsError(true);
        return { success: false, error };
      }

      setStatusMessage("Chargement des contacts...");
      setIsError(false);

      try {
        const result = await electronAPI.remoteApi.getContacts();

        if (!result.success) {
          setStatusMessage(`Erreur API : ${result.error}`);
          setIsError(true);
          return result;
        }

        const rows = result.rows || [];
        const nextInfo = info || serverInfo;

        tableCacheRef.current.clear();
        setSourceMode(DATA_SOURCE_SERVER);
        setServerInfo(nextInfo);
        setFilePath(null);
        setTables([SERVER_TABLE_NAME]);
        setCurrentTable(SERVER_TABLE_NAME);
        setColumns(result.columns || []);
        setAllRecords(rows);
        resetView();
        setStatusMessage(rows.length === 0 ? "Connexion active - aucun contact." : "");
        setIsError(false);

        return { success: true };
      } catch (err) {
        const error = err?.message || "Erreur API inconnue.";
        setStatusMessage(`Erreur API : ${error}`);
        setIsError(true);
        return { success: false, error };
      }
    },
    [resetView, serverInfo],
  );

  const connectServer = useCallback(
    async (config, remember) => {
      if (!electronAPI?.remoteApi) {
        return { success: false, error: "API distante indisponible dans le renderer." };
      }

      setStatusMessage("Connexion...");
      setIsError(false);

      try {
        const result = await electronAPI.remoteApi.connect(config, remember);

        if (!result.success) {
          setStatusMessage(`Erreur API : ${result.error}`);
          setIsError(true);
          return result;
        }

        const info = {
          host: result.url || config.url,
          database: result.name || "Carnet",
        };
        const loadResult = await loadServerContacts(info);

        if (!loadResult.success) {
          return loadResult;
        }

        if (result.warning) {
          setStatusMessage(result.warning);
        }

        return { success: true };
      } catch (err) {
        const error = err?.message || "Connexion impossible.";
        setStatusMessage(`Erreur API : ${error}`);
        setIsError(true);
        return { success: false, error };
      }
    },
    [loadServerContacts],
  );

  const disconnectServer = useCallback(async () => {
    if (!electronAPI?.remoteApi) {
      return { success: false, error: "API distante indisponible dans le renderer." };
    }

    setStatusMessage("Deconnexion...");
    setIsError(false);

    try {
      const result = await electronAPI.remoteApi.disconnect();

      if (!result.success) {
        setStatusMessage(`Erreur API : ${result.error}`);
        setIsError(true);
        return result;
      }

      setSourceMode(DATA_SOURCE_LOCAL);
      setServerInfo(null);
      clearRecords("Deconnecte. Aucune source de donnees ouverte.");
      return { success: true };
    } catch (err) {
      const error = err?.message || "Deconnexion impossible.";
      setStatusMessage(`Erreur API : ${error}`);
      setIsError(true);
      return { success: false, error };
    }
  }, [clearRecords]);

  const refreshServerContacts = useCallback(async () => {
    if (!serverInfo) {
      return { success: false, error: "Aucune connexion active." };
    }

    return loadServerContacts(serverInfo);
  }, [loadServerContacts, serverInfo]);

  const openDatabase = useCallback(async () => {
    if (!electronAPI) return;

    const nextFilePath = await electronAPI.openFile();

    if (!nextFilePath) {
      return;
    }

    if (sourceMode === DATA_SOURCE_SERVER && electronAPI.remoteApi) {
      await electronAPI.remoteApi.disconnect().catch(() => {});
    }

    setStatusMessage("Chargement...");
    setIsError(false);

    const result = await electronAPI.loadDatabase(nextFilePath);

    if (!result.success) {
      setStatusMessage(`Erreur : ${result.error}`);
      setIsError(true);
      return;
    }

    tableCacheRef.current.clear();

    setFilePath(nextFilePath);
    setSourceMode(DATA_SOURCE_LOCAL);
    setServerInfo(null);
    setTables(result.tables);
    resetView();
    setIsError(false);

    if (result.tables.length === 0) {
      setCurrentTable("");
      setColumns([]);
      setAllRecords([]);
      setStatusMessage("Aucune table trouvee dans la base.");
      return;
    }

    await loadTable(nextFilePath, result.tables[0]);
  }, [loadTable, resetView, sourceMode]);

  useEffect(() => {
    if (!electronAPI) return undefined;
    return electronAPI.onMenuOpenFile(() => {
      void openDatabase();
    });
  }, [openDatabase]);

  async function handleChangeTable(tableName) {
    if (sourceMode === DATA_SOURCE_SERVER) {
      await refreshServerContacts();
      return;
    }

    await loadTable(filePath, tableName);
  }

  function toggleRow(rowId) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }

      return next;
    });
  }

  function handleToggleAll(checked) {
    if (checked) {
      selectFiltered();
      return;
    }

    deselectFiltered();
  }

  function selectAll() {
    setSelected(new Set(allRecords.map((record) => record._id)));
  }

  function selectFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      filteredRecords.forEach((record) => next.add(record._id));
      return next;
    });
  }

  function deselectFiltered() {
    setSelected((current) => {
      if (current.size === 0) return current;
      const next = new Set(current);
      filteredRecords.forEach((record) => next.delete(record._id));
      return next;
    });
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function handleSort(column) {
    if (sortCol === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortCol(column);
    setSortDir("asc");
  }

  function handleChangeFilter(column, value) {
    setColumnFilters((current) => ({ ...current, [column]: value }));
  }

  function handleToggleMultiFilterValue(column, value) {
    setColumnFilters((current) => {
      const activeValues = Array.isArray(current[column]) ? current[column] : [];
      const nextValues = activeValues.includes(value)
        ? activeValues.filter((item) => item !== value)
        : [...activeValues, value];

      return {
        ...current,
        [column]: nextValues,
      };
    });
  }

  async function printLabels() {
    if (!electronAPI) return;
    if (selectedRecords.length === 0) {
      window.alert(
        "Aucun enregistrement selectionne.\nCochez des lignes dans le tableau avant d'imprimer.",
      );
      return;
    }

    setPrintMarkup(buildPrintHTML(selectedRecords, labelLayout));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const result = await electronAPI.printLabels({
      printBackground: false,
      margins: { marginType: "none" },
      pageSize: "A4",
    });

    setPrintMarkup("");

    if (!result.success) {
      window.alert(`Erreur d'impression : ${result.error || "inconnue"}`);
    }
  }

  async function exportSQLite() {
    if (sourceMode !== DATA_SOURCE_LOCAL || !filePath || !electronAPI) return;

    const result = await electronAPI.exportSQLite(filePath);

    if (result.canceled) return;

    if (!result.success) {
      window.alert(`Erreur export SQLite : ${result.error || "inconnue"}`);
      return;
    }

    setStatusMessage(
      `SQLite exporte : ${result.tableCount} table(s), ${result.rowCount} enregistrement(s)`,
    );
  }

  // MIGRATION ONE-SHOT — TODO: supprimer apres bascule MariaDB
  async function exportSQL() {
    if (sourceMode !== DATA_SOURCE_LOCAL || !filePath || !currentTable || !electronAPI) return;

    const result = await electronAPI.exportSQL(filePath, currentTable);

    if (result.canceled) return;

    if (!result.success) {
      window.alert(`Erreur export SQL : ${result.error || "inconnue"}`);
      return;
    }

    const skippedNote = result.skipped > 0 ? `, ${result.skipped} ignore(s)` : "";
    setStatusMessage(
      `SQL MariaDB exporte : ${result.contactCount} contact(s), ${result.linkCount} lien(s) liste${skippedNote}`,
    );
  }

  async function exportExcel() {
    if (!electronAPI) return;
    if (selectedRecords.length === 0) {
      window.alert(
        "Aucun enregistrement selectionne.\nCochez des lignes dans le tableau avant d'exporter.",
      );
      return;
    }

    const result = await electronAPI.exportExcel({
      tableName: currentTable,
      columns,
      rows: selectedRecords,
    });

    if (!result.success && !result.canceled) {
      window.alert(`Erreur d'export Excel : ${result.error || "inconnue"}`);
    }
  }

  const hasData = allRecords.length > 0;
  const isServerMode = sourceMode === DATA_SOURCE_SERVER;
  const controlsDisabled = isServerMode ? !serverInfo : tables.length === 0;
  const canPrint = selected.size > 0;
  const canExport = selected.size > 0;
  const canExportAccess = sourceMode === DATA_SOURCE_LOCAL && Boolean(filePath) && tables.length > 0;
  const previewCountText = `${selectedRecords.length} etiquette(s) - ${getPageCount(selectedRecords.length)} page(s)`;

  return (
    <>
      <div id="app-shell">
        <Toolbar
          onOpen={openDatabase}
          tables={tables}
          currentTable={currentTable}
          onChangeTable={handleChangeTable}
          globalSearch={globalSearch}
          onChangeSearch={setGlobalSearch}
          disabled={controlsDisabled}
          status={statusText}
          isError={isError}
          onExportSQLite={exportSQLite}
          onExportSQL={exportSQL}
          sourceMode={sourceMode}
          serverInfo={serverInfo}
          canExportAccess={canExportAccess}
          onOpenServer={() => setIsServerModalOpen(true)}
          onDisconnectServer={() => {
            void disconnectServer();
          }}
          onRefreshServer={() => {
            void refreshServerContacts();
          }}
        />

        <div className="app-body">
          <Sidebar
            disabled={!hasData}
            sourceMode={sourceMode}
            serverInfo={serverInfo}
            onRefreshServer={() => {
              void refreshServerContacts();
            }}
            filterColumns={filterColumns}
            columnFilters={columnFilters}
            onChangeFilter={handleChangeFilter}
            onToggleMultiFilterValue={handleToggleMultiFilterValue}
            onResetFilters={() => {
              setColumnFilters({});
              setGlobalSearch("");
            }}
            labelLayout={labelLayout}
            onSelectAll={selectAll}
            onSelectFiltered={selectFiltered}
            onDeselectAll={deselectAll}
            canPrint={canPrint}
            canExport={canExport}
            onPreview={() => setIsPreviewOpen(true)}
            onPrint={printLabels}
            onExportExcel={exportExcel}
          />

          <main className="main-content">
            {hasData ? (
              <RecordsTable
                columns={columns}
                rows={filteredRecords}
                selected={selected}
                onToggleRow={toggleRow}
                onToggleAll={handleToggleAll}
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={handleSort}
              />
            ) : (
              <EmptyState
                sourceMode={sourceMode}
                onOpen={openDatabase}
                onOpenServer={() => setIsServerModalOpen(true)}
              />
            )}
          </main>
        </div>

        <ServerConnectionModal
          open={isServerModalOpen}
          remoteApi={electronAPI?.remoteApi}
          onClose={() => setIsServerModalOpen(false)}
          onConnect={connectServer}
        />

        <PreviewModal
          open={isPreviewOpen}
          html={previewHtml}
          countText={previewCountText}
          onClose={() => setIsPreviewOpen(false)}
          onPrint={printLabels}
        />
      </div>

      <div id="print-area" dangerouslySetInnerHTML={{ __html: printMarkup }} />
    </>
  );
}
