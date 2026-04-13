const LABELS_PER_PAGE = 33;
const LABEL_LAYOUT = [
  {
    key: "organisation",
    label: "Organisation",
    mode: "single",
    candidates: [
      "organisation",
      "organisme",
      "societe",
      "entreprise",
      "structure",
    ],
  },
  {
    key: "identite",
    label: "Titre, Nom Prenom",
    mode: "group",
    groups: [
      ["titre"],
      ["nom prenom", "prenom nom", "nom complet"],
      ["nom", "prenom"],
    ],
  },
  {
    key: "fonction",
    label: "Fonction",
    mode: "single",
    candidates: ["fonction", "poste", "qualite"],
  },
  {
    key: "adresse",
    label: "Adresse, Numero",
    mode: "group",
    groups: [
      ["adresse", "adresse 1", "rue"],
      ["numero", "num", "numero de rue"],
    ],
  },
  {
    key: "ville",
    label: "Code postal, Ville",
    mode: "group",
    groups: [
      ["code postal", "codepostal", "cp"],
      ["ville", "localite", "commune"],
    ],
  },
];

function normalizeFieldName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createColumnIndex(columns) {
  return new Map(columns.map((column) => [normalizeFieldName(column), column]));
}

function resolveGroup(group, columnIndex) {
  const fields = group
    .map((candidate) => columnIndex.get(normalizeFieldName(candidate)))
    .filter(Boolean);

  return fields.length > 0 ? fields : null;
}

function resolveLayoutItem(item, columnIndex) {
  if (item.mode === "single") {
    const field = item.candidates
      .map((candidate) => columnIndex.get(normalizeFieldName(candidate)))
      .find(Boolean);

    return {
      ...item,
      resolvedGroups: field ? [[field]] : [],
    };
  }

  return {
    ...item,
    resolvedGroups: item.groups
      .map((group) => resolveGroup(group, columnIndex))
      .filter(Boolean),
  };
}

function getGroupValues(row, group) {
  return group.map((field) => row[field]).filter(Boolean);
}

function buildLabelLines(row, labelLayout) {
  return labelLayout
    .map((item) => {
      if (!item.resolvedGroups || item.resolvedGroups.length === 0) {
        return "";
      }

      const parts = item.resolvedGroups
        .map((group) => getGroupValues(row, group).join(" "))
        .filter(Boolean);

      return parts.join(" ");
    })
    .filter(Boolean);
}

function chunkRecords(records) {
  const pages = [];

  for (let index = 0; index < records.length; index += LABELS_PER_PAGE) {
    pages.push(records.slice(index, index + LABELS_PER_PAGE));
  }

  return pages;
}

function buildLabelMarkup(records, labelLayout, itemClass, pageClass) {
  if (records.length === 0) {
    return "";
  }

  return chunkRecords(records)
    .map((page) => {
      const labels = page
        .map((row) => {
          const lines = buildLabelLines(row, labelLayout)
            .map((line) => escapeHtml(line))
            .join("<br>");

          return `<div class="${itemClass}">${lines}</div>`;
        })
        .join("");

      const emptyItems = Array(LABELS_PER_PAGE - page.length)
        .fill(`<div class="${itemClass}"></div>`)
        .join("");

      return `<div class="${pageClass}">${labels}${emptyItems}</div>`;
    })
    .join("");
}

export function resolveLabelLayout(columns) {
  const columnIndex = createColumnIndex(columns);
  return LABEL_LAYOUT.map((item) => resolveLayoutItem(item, columnIndex));
}

export function buildPreviewHTML(records, labelLayout) {
  if (records.length === 0) {
    return '<p style="padding:16px;color:#666;">Aucun enregistrement selectionne.</p>';
  }

  return buildLabelMarkup(
    records,
    labelLayout,
    "label-preview",
    "label-page-preview",
  );
}

export function buildPrintHTML(records, labelLayout) {
  return buildLabelMarkup(
    records,
    labelLayout,
    "print-label",
    "print-label-page",
  );
}

export function getPageCount(recordCount) {
  return Math.ceil(recordCount / LABELS_PER_PAGE);
}
