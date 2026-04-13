import { useEffect, useMemo, useState } from "react";
import EmptyState from "./components/EmptyState";
import PreviewModal from "./components/PreviewModal";
import RecordsTable from "./components/RecordsTable";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import { buildPreviewHTML, buildPrintHTML, getPageCount, resolveLabelLayout } from "./lib/labels";

const FILTERABLE_COLUMNS = ["categorie", "ville", "code postal"];
const MULTI_SELECT_FILTER_COLUMNS = ["categorie"];

function normalizeFilterName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeFilterValue(value) {
  return String(value).trim();
}

function getElectronApi() {
  if (!window.electronAPI) {
    throw new Error("electronAPI indisponible dans le renderer.");
  }

  return window.electronAPI;
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
  const [tables, setTables] = useState([]);
  const [currentTable, setCurrentTable] = useState("");
  const [columns, setColumns] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [columnFilters, setColumnFilters] = useState({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [statusMessage, setStatusMessage] = useState("Aucune base de donnees ouverte");
  const [isError, setIsError] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [printMarkup, setPrintMarkup] = useState("");

  const electronAPI = getElectronApi();

  const filterColumns = useMemo(() => {
    return columns
      .filter((column) => FILTERABLE_COLUMNS.includes(normalizeFilterName(column)))
      .map((column) => ({
        name: column,
        isMultiSelect: MULTI_SELECT_FILTER_COLUMNS.includes(normalizeFilterName(column)),
        values: [...new Set(allRecords.map((row) => normalizeFilterValue(row[column])).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
      }));
  }, [allRecords, columns]);

  const labelLayout = useMemo(() => resolveLabelLayout(columns), [columns]);

  const filteredRecords = useMemo(() => {
    let rows = allRecords;

    if (globalSearch.trim()) {
      const query = globalSearch.trim().toLowerCase();
      rows = rows.filter((row) =>
        columns.some((column) => row[column].toLowerCase().includes(query)),
      );
    }

    for (const [column, value] of Object.entries(columnFilters)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }

        const allowedValues = new Set(value.map((item) => normalizeFilterValue(item).toLowerCase()));
        rows = rows.filter((row) =>
          allowedValues.has(normalizeFilterValue(row[column]).toLowerCase()),
        );
        continue;
      }

      if (!value) {
        continue;
      }

      const query = normalizeFilterValue(value).toLowerCase();
      rows = rows.filter((row) =>
        normalizeFilterValue(row[column]).toLowerCase().includes(query),
      );
    }

    if (sortCol) {
      const direction = sortDir === "asc" ? 1 : -1;
      rows = [...rows].sort(
        (left, right) =>
          left[sortCol].localeCompare(right[sortCol], "fr", { sensitivity: "base" }) * direction,
      );
    }

    return rows;
  }, [allRecords, columnFilters, columns, globalSearch, sortCol, sortDir]);

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

  useEffect(() => {
    const unsubscribe = electronAPI.onMenuOpenFile(() => {
      void openDatabase();
    });

    return unsubscribe;
  }, []);

  async function openDatabase() {
    const nextFilePath = await electronAPI.openFile();

    if (!nextFilePath) {
      return;
    }

    setStatusMessage("Chargement...");
    setIsError(false);

    const result = await electronAPI.loadDatabase(nextFilePath);

    if (!result.success) {
      setStatusMessage(`Erreur : ${result.error}`);
      setIsError(true);
      return;
    }

    setFilePath(nextFilePath);
    setTables(result.tables);
    setSelected(new Set());
    setColumnFilters({});
    setGlobalSearch("");
    setSortCol(null);
    setSortDir("asc");
    setIsError(false);

    if (result.tables.length === 0) {
      setCurrentTable("");
      setColumns([]);
      setAllRecords([]);
      setStatusMessage("Aucune table trouvee dans la base.");
      return;
    }

    await loadTable(nextFilePath, result.tables[0]);
  }

  async function loadTable(activeFilePath, tableName) {
    if (!tableName) {
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

    setCurrentTable(tableName);
    setColumns(result.columns);
    setAllRecords(result.rows);
    setSelected(new Set());
    setColumnFilters({});
    setGlobalSearch("");
    setSortCol(null);
    setSortDir("asc");
    setStatusMessage("");
    setIsError(false);
  }

  async function handleChangeTable(tableName) {
    setCurrentTable(tableName);
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

    deselectAll();
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
    if (selectedRecords.length === 0) {
      window.alert(
        "Aucun enregistrement selectionne.\nCochez des lignes dans le tableau avant d'imprimer.",
      );
      return;
    }

    setPrintMarkup(buildPrintHTML(selectedRecords, labelLayout));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const result = await electronAPI.printLabels({
      silent: false,
      printBackground: false,
      margins: { marginType: "none" },
      pageSize: "A4",
    });

    setPrintMarkup("");

    if (!result.success) {
      window.alert(`Erreur d'impression : ${result.error || "inconnue"}`);
    }
  }

  async function exportExcel() {
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
  const controlsDisabled = tables.length === 0;
  const canPrint = selected.size > 0;
  const canExport = selected.size > 0;
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
        />

        <div className="app-body">
          <Sidebar
            disabled={!hasData}
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
              <EmptyState onOpen={openDatabase} />
            )}
          </main>
        </div>

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
