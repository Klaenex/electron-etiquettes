function SourceSection({ sourceMode, serverInfo, onRefreshServer }) {
  if (sourceMode !== "server") {
    return null;
  }

  return (
    <section className="sidebar-section">
      <h3>Source</h3>
      <div className="source-summary">
        <strong>Connexion API</strong>
        <span>{serverInfo ? serverInfo.database : "Non connecte"}</span>
        <span>{serverInfo ? serverInfo.host : ""}</span>
      </div>
      <button disabled={!serverInfo} onClick={onRefreshServer}>
        Actualiser les contacts
      </button>
    </section>
  );
}

function SelectionSection({ disabled, onSelectAll, onSelectFiltered, onDeselectAll }) {
  return (
    <section className="sidebar-section">
      <h3>Selection</h3>
      <button disabled={disabled} onClick={onSelectAll}>
        Tout selectionner
      </button>
      <button disabled={disabled} onClick={onSelectFiltered}>
        Selectionner filtres
      </button>
      <button disabled={disabled} onClick={onDeselectAll}>
        Tout deselectionner
      </button>
    </section>
  );
}

function FiltersSection({
  columns,
  filters,
  onChangeFilter,
  onToggleMultiFilterValue,
  onResetFilters,
}) {
  return (
    <section className="sidebar-section">
      <h3>Filtres par colonne</h3>
      <div id="column-filters">
        {columns.length === 0 ? (
          <p className="placeholder-text">Chargez une source de donnees pour voir les filtres.</p>
        ) : (
          <>
            <button className="btn-reset-filters" onClick={onResetFilters}>
              Effacer les filtres
            </button>
            {columns.map(({ name, values, isMultiSelect, valueLabels = {} }) => (
              <div className="filter-item" key={name}>
                <label>{name}</label>
                {isMultiSelect ? (
                  <div className="filter-checklist">
                    {values.map((value) => {
                      const checked = Array.isArray(filters[name]) && filters[name].includes(value);
                      const displayLabel = valueLabels[value] ?? value;

                      return (
                        <label className="filter-checkbox-item" key={value} title={displayLabel}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleMultiFilterValue(name, value)}
                          />
                          <span>{displayLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <select
                    id={`filter-${name}`}
                    value={filters[name] || ""}
                    onChange={(event) => onChangeFilter(name, event.target.value)}
                  >
                    <option value="">Toutes</option>
                    {values.map((value) => {
                      const displayLabel = valueLabels[value] ?? value;
                      const truncated = displayLabel.length > 30 ? `${displayLabel.slice(0, 30)}...` : displayLabel;
                      return (
                        <option key={value} value={value} title={displayLabel}>
                          {truncated}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function LabelFieldsSection({ labelLayout }) {
  return (
    <section className="sidebar-section">
      <h3>Etiquettes - champs</h3>
      <p className="hint">Mise en page fixe utilisee pour chaque etiquette.</p>
      <div id="label-fields-config">
        {labelLayout.length === 0 ? (
          <p className="placeholder-text">Chargez une source de donnees pour configurer.</p>
        ) : (
          labelLayout.map((item) => (
            <div className="label-field-item label-field-static" key={item.key}>
              <span className="field-name" title={item.label}>
                {item.label}
              </span>
              <span className="field-source">
                {item.resolvedGroups.length > 0
                  ? item.resolvedGroups.map((group) => group.join(" + ")).join(" | ")
                  : "non trouve"}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function Sidebar(props) {
  const {
    disabled,
    sourceMode,
    serverInfo,
    onRefreshServer,
    filterColumns,
    columnFilters,
    onChangeFilter,
    onToggleMultiFilterValue,
    onResetFilters,
    labelLayout,
    onSelectAll,
    onSelectFiltered,
    onDeselectAll,
    canPrint,
    canExport,
    onPreview,
    onPrint,
    onExportExcel,
  } = props;

  return (
    <aside className="sidebar">
      <SourceSection
        sourceMode={sourceMode}
        serverInfo={serverInfo}
        onRefreshServer={onRefreshServer}
      />

      <SelectionSection
        disabled={disabled}
        onSelectAll={onSelectAll}
        onSelectFiltered={onSelectFiltered}
        onDeselectAll={onDeselectAll}
      />

      <FiltersSection
        columns={filterColumns}
        filters={columnFilters}
        onChangeFilter={onChangeFilter}
        onToggleMultiFilterValue={onToggleMultiFilterValue}
        onResetFilters={onResetFilters}
      />

      <LabelFieldsSection labelLayout={labelLayout} />

      <section className="sidebar-section sidebar-actions">
        <button className="btn-primary" disabled={!canPrint} onClick={onPreview}>
          Apercu etiquettes
        </button>
        <button className="btn-primary" disabled={!canPrint} onClick={onPrint}>
          Imprimer
        </button>
        <button className="btn-primary" disabled={!canExport} onClick={onExportExcel}>
          Export Excel
        </button>
      </section>
    </aside>
  );
}
