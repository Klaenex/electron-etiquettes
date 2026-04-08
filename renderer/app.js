/* ══════════════════════════════════════════════════════════════════
   app.js — Logique renderer (vanilla JS)
   ══════════════════════════════════════════════════════════════════ */

'use strict';

// ─── État global ──────────────────────────────────────────────────
const state = {
  filePath: null,
  tables: [],
  currentTable: null,
  columns: [],          // noms des colonnes
  allRecords: [],       // tous les enregistrements chargés
  filtered: [],         // après filtres actifs
  selected: new Set(),  // _id des lignes sélectionnées
  labelFields: [],      // colonnes cochées pour l'étiquette
  columnFilters: {},    // { colName: valeurRecherchée }
  globalSearch: '',
  sortCol: null,
  sortDir: 'asc',       // 'asc' | 'desc'
};

// ─── Éléments DOM ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const btnOpen        = $('btn-open');
const btnOpenEmpty   = $('btn-open-empty');
const selectTable    = $('select-table');
const searchGlobal   = $('search-global');
const statusBar      = $('status-bar');

const btnSelectAll      = $('btn-select-all');
const btnSelectFiltered = $('btn-select-filtered');
const btnDeselectAll    = $('btn-deselect-all');

const columnFiltersDiv  = $('column-filters');
const labelFieldsDiv    = $('label-fields-config');

const btnPreview  = $('btn-preview');
const btnPrint    = $('btn-print');

const emptyState     = $('empty-state');
const tableContainer = $('table-container');
const tableHead      = $('table-head');
const tableBody      = $('table-body');

const modalPreview       = $('modal-preview');
const modalClose         = $('modal-close');
const labelPreviewArea   = $('label-preview-area');
const previewCount       = $('preview-count');
const btnPrintFromModal  = $('btn-print-from-modal');

// Zone d'impression cachée
const printArea = document.createElement('div');
printArea.id = 'print-area';
document.body.appendChild(printArea);

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Boutons ouvrir
  btnOpen.addEventListener('click', openDatabase);
  btnOpenEmpty.addEventListener('click', openDatabase);
  window.electronAPI.onMenuOpenFile(openDatabase);

  // Sélection de table
  selectTable.addEventListener('change', () => loadTable(selectTable.value));

  // Recherche globale
  searchGlobal.addEventListener('input', () => {
    state.globalSearch = searchGlobal.value.trim().toLowerCase();
    applyFilters();
  });

  // Sélection
  btnSelectAll.addEventListener('click', selectAll);
  btnSelectFiltered.addEventListener('click', selectFiltered);
  btnDeselectAll.addEventListener('click', deselectAll);

  // Impression / aperçu
  btnPreview.addEventListener('click', showPreview);
  btnPrint.addEventListener('click', printLabels);
  btnPrintFromModal.addEventListener('click', printLabels);

  // Modal
  modalClose.addEventListener('click', closeModal);
  $('modal-backdrop') || modalPreview.querySelector('.modal-backdrop').addEventListener('click', closeModal);
});

// ─── Ouverture de la base de données ─────────────────────────────
async function openDatabase() {
  const filePath = await window.electronAPI.openFile();
  if (!filePath) return;

  setStatus('Chargement…');
  const result = await window.electronAPI.loadDatabase(filePath);

  if (!result.success) {
    setStatus('Erreur : ' + result.error, true);
    return;
  }

  state.filePath = filePath;
  state.tables = result.tables;
  state.selected.clear();

  // Remplir le select tables
  selectTable.innerHTML = '';
  if (result.tables.length === 0) {
    selectTable.innerHTML = '<option value="">Aucune table trouvée</option>';
    selectTable.disabled = true;
    setStatus('Aucune table trouvée dans la base.');
    return;
  }

  result.tables.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    selectTable.appendChild(opt);
  });
  selectTable.disabled = false;
  searchGlobal.disabled = false;

  // Charger la première table automatiquement
  await loadTable(result.tables[0]);
}

// ─── Chargement d'une table ───────────────────────────────────────
async function loadTable(tableName) {
  if (!tableName) return;
  setStatus('Chargement de la table « ' + tableName + ' »…');

  const result = await window.electronAPI.getTable(state.filePath, tableName);
  if (!result.success) {
    setStatus('Erreur : ' + result.error, true);
    return;
  }

  state.currentTable = tableName;
  state.columns = result.columns;
  state.allRecords = result.rows;
  state.selected.clear();
  state.columnFilters = {};
  state.globalSearch = '';
  state.sortCol = null;
  state.sortDir = 'asc';
  searchGlobal.value = '';

  // Par défaut : tous les champs cochés pour l'étiquette
  state.labelFields = [...result.columns];

  buildColumnFilters();
  buildLabelFieldsConfig();
  buildTableHeader();
  applyFilters();

  enableButtons(true);
  emptyState.classList.add('hidden');
  tableContainer.classList.remove('hidden');
}

// ─── Filtrage ─────────────────────────────────────────────────────
function applyFilters() {
  let rows = state.allRecords;

  // Recherche globale
  if (state.globalSearch) {
    const q = state.globalSearch;
    rows = rows.filter((row) =>
      state.columns.some((col) => row[col].toLowerCase().includes(q))
    );
  }

  // Filtres par colonne
  for (const [col, val] of Object.entries(state.columnFilters)) {
    if (!val) continue;
    const q = val.toLowerCase();
    rows = rows.filter((row) => row[col].toLowerCase().includes(q));
  }

  // Tri
  if (state.sortCol) {
    const col = state.sortCol;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => a[col].localeCompare(b[col], 'fr', { sensitivity: 'base' }) * dir);
  }

  state.filtered = rows;
  renderTable();
  updateStatus();
}

// ─── Rendu de la table ───────────────────────────────────────────
function buildTableHeader() {
  tableHead.innerHTML = '';
  const tr = document.createElement('tr');

  // Colonne checkbox "tout sélectionner"
  const thCheck = document.createElement('th');
  thCheck.className = 'col-check';
  const masterCb = document.createElement('input');
  masterCb.type = 'checkbox';
  masterCb.title = 'Tout sélectionner / désélectionner';
  masterCb.addEventListener('change', () => {
    if (masterCb.checked) selectFiltered();
    else deselectAll();
  });
  thCheck.appendChild(masterCb);
  tr.appendChild(thCheck);

  state.columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.dataset.col = col;
    th.addEventListener('click', () => {
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      // Mise à jour visuelle des en-têtes
      tableHead.querySelectorAll('th[data-col]').forEach((h) => {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      applyFilters();
    });
    tr.appendChild(th);
  });

  tableHead.appendChild(tr);
}

function renderTable() {
  tableBody.innerHTML = '';

  const fragment = document.createDocumentFragment();

  state.filtered.forEach((row) => {
    const tr = document.createElement('tr');
    if (state.selected.has(row._id)) tr.classList.add('selected');

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(row._id);
    cb.addEventListener('change', () => {
      if (cb.checked) state.selected.add(row._id);
      else state.selected.delete(row._id);
      tr.classList.toggle('selected', cb.checked);
      updateStatus();
    });
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    state.columns.forEach((col) => {
      const td = document.createElement('td');
      td.textContent = row[col];
      td.title = row[col];
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  tableBody.appendChild(fragment);

  // Mettre à jour la master checkbox
  const masterCb = tableHead.querySelector('input[type="checkbox"]');
  if (masterCb) {
    masterCb.checked = state.filtered.length > 0 &&
      state.filtered.every((r) => state.selected.has(r._id));
    masterCb.indeterminate = !masterCb.checked &&
      state.filtered.some((r) => state.selected.has(r._id));
  }
}

// ─── Filtres par colonne ─────────────────────────────────────────
function buildColumnFilters() {
  columnFiltersDiv.innerHTML = '';

  if (state.columns.length === 0) {
    columnFiltersDiv.innerHTML = '<p class="placeholder-text">Aucune colonne.</p>';
    return;
  }

  // Bouton reset tous les filtres
  const btnReset = document.createElement('button');
  btnReset.textContent = '✕ Effacer les filtres';
  btnReset.className = 'btn-reset-filters';
  btnReset.addEventListener('click', resetAllFilters);
  columnFiltersDiv.appendChild(btnReset);

  state.columns.forEach((col) => {
    // Récupérer les valeurs uniques non vides, triées
    const uniqueValues = [...new Set(
      state.allRecords.map((r) => r[col]).filter((v) => v !== '')
    )].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    // Ne créer le filtre que si la colonne a plusieurs valeurs distinctes
    if (uniqueValues.length < 2) return;

    const div = document.createElement('div');
    div.className = 'filter-item';

    const label = document.createElement('label');
    label.textContent = col;

    const select = document.createElement('select');
    select.dataset.col = col;

    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = '— Toutes —';
    select.appendChild(optAll);

    uniqueValues.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val.length > 30 ? val.slice(0, 30) + '…' : val;
      opt.title = val;
      select.appendChild(opt);
    });

    // Restaurer la valeur si un filtre était déjà actif
    if (state.columnFilters[col]) select.value = state.columnFilters[col];

    select.addEventListener('change', () => {
      state.columnFilters[col] = select.value;
      applyFilters();
    });

    div.appendChild(label);
    div.appendChild(select);
    columnFiltersDiv.appendChild(div);
  });
}

function resetAllFilters() {
  state.columnFilters = {};
  state.globalSearch = '';
  searchGlobal.value = '';
  // Remettre tous les selects à "— Toutes —"
  columnFiltersDiv.querySelectorAll('select').forEach((s) => { s.value = ''; });
  applyFilters();
}

// ─── Configuration des champs d'étiquette ────────────────────────
function buildLabelFieldsConfig() {
  labelFieldsDiv.innerHTML = '';

  state.columns.forEach((col) => {
    const div = document.createElement('div');
    div.className = 'label-field-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.labelFields.includes(col);
    cb.id = 'lf-' + col;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!state.labelFields.includes(col)) state.labelFields.push(col);
      } else {
        state.labelFields = state.labelFields.filter((f) => f !== col);
      }
    });

    const label = document.createElement('label');
    label.htmlFor = 'lf-' + col;
    label.className = 'field-name';
    label.textContent = col;
    label.title = col;

    div.appendChild(cb);
    div.appendChild(label);
    labelFieldsDiv.appendChild(div);
  });
}

// ─── Sélection ───────────────────────────────────────────────────
function selectAll() {
  state.allRecords.forEach((r) => state.selected.add(r._id));
  renderTable();
  updateStatus();
}

function selectFiltered() {
  state.filtered.forEach((r) => state.selected.add(r._id));
  renderTable();
  updateStatus();
}

function deselectAll() {
  state.selected.clear();
  renderTable();
  updateStatus();
}

// ─── Génération HTML étiquettes ──────────────────────────────────
function getSelectedRecords() {
  return state.filtered.filter((r) => state.selected.has(r._id));
}

function buildLabelHTML(records) {
  if (records.length === 0) return '';

  const LABELS_PER_PAGE = 33; // 3 × 11
  const pages = [];

  for (let i = 0; i < records.length; i += LABELS_PER_PAGE) {
    pages.push(records.slice(i, i + LABELS_PER_PAGE));
  }

  return pages
    .map((page) => {
      const labels = page
        .map((row) => {
          const lines = state.labelFields
            .filter((f) => row[f])
            .map((f) => escapeHtml(row[f]))
            .join('<br>');
          return `<div class="print-label">${lines}</div>`;
        })
        .join('');

      // Compléter la dernière page avec des étiquettes vides + marge gauche
      const remaining = LABELS_PER_PAGE - page.length;
      const empties = Array(remaining).fill('<div class="print-label"></div>').join('');
      const marginLeft = '<div style="grid-column:1;"></div>'; // Marge gauche 10mm

      return `<div class="print-label-page">${marginLeft}${labels}${empties}</div>`;
    })
    .join('');
}

function buildPreviewHTML(records) {
  if (records.length === 0) return '<p style="padding:16px;color:#666;">Aucun enregistrement sélectionné.</p>';

  const LABELS_PER_PAGE = 33;
  const pages = [];

  for (let i = 0; i < records.length; i += LABELS_PER_PAGE) {
    pages.push(records.slice(i, i + LABELS_PER_PAGE));
  }

  return pages
    .map((page) => {
      const labels = page
        .map((row) => {
          const lines = state.labelFields
            .filter((f) => row[f])
            .map((f) => escapeHtml(row[f]))
            .join('<br>');
          return `<div class="label-preview">${lines}</div>`;
        })
        .join('');

      const remaining = LABELS_PER_PAGE - page.length;
      const empties = Array(remaining).fill('<div class="label-preview"></div>').join('');
      const marginLeft = '<div style="width:10mm;"></div>'; // Marge gauche 10mm

      return `<div class="label-page-preview">${marginLeft}${labels}${empties}</div>`;
    })
    .join('');
}

// ─── Aperçu ──────────────────────────────────────────────────────
function showPreview() {
  const records = getSelectedRecords();
  labelPreviewArea.innerHTML = buildPreviewHTML(records);

  const pages = Math.ceil(records.length / 33);
  previewCount.textContent = `${records.length} étiquette(s) — ${pages} page(s)`;

  modalPreview.classList.remove('hidden');
}

function closeModal() {
  modalPreview.classList.add('hidden');
}

// ─── Impression ──────────────────────────────────────────────────
async function printLabels() {
  const records = getSelectedRecords();
  if (records.length === 0) {
    alert('Aucun enregistrement sélectionné.\nCochez des lignes dans le tableau avant d\'imprimer.');
    return;
  }

  // Injecter le HTML dans la zone d'impression cachée
  printArea.innerHTML = buildLabelHTML(records);

  // Déclencher l'impression via le processus principal
  const result = await window.electronAPI.printLabels({
    silent: false,
    printBackground: false,
    margins: { marginType: 'none' },
    pageSize: 'A4',
  });

  // Nettoyer
  printArea.innerHTML = '';

  if (!result.success) {
    alert('Erreur d\'impression : ' + (result.error || 'inconnue'));
  }
}

// ─── Utilitaires ─────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(msg, isError = false) {
  statusBar.textContent = msg;
  statusBar.style.color = isError ? '#dc2626' : '';
}

function updateStatus() {
  const total = state.allRecords.length;
  const filtered = state.filtered.length;
  const selected = state.selected.size;

  let msg = `${total} enregistrement(s)`;
  if (filtered < total) msg += ` — ${filtered} affiché(s)`;
  if (selected > 0) msg += ` — ${selected} sélectionné(s)`;
  if (state.currentTable) msg = `[${state.currentTable}]  ${msg}`;

  setStatus(msg);

  // Activer/désactiver boutons d'impression
  const canPrint = selected > 0;
  btnPreview.disabled = !canPrint;
  btnPrint.disabled = !canPrint;
}

function enableButtons(on) {
  btnSelectAll.disabled = !on;
  btnSelectFiltered.disabled = !on;
  btnDeselectAll.disabled = !on;
}
