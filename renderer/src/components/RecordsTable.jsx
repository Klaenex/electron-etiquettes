import { useEffect, useRef } from "react";

function MasterCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

export default function RecordsTable({
  columns,
  rows,
  selected,
  onToggleRow,
  onToggleAll,
  sortCol,
  sortDir,
  onSort,
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row._id));
  const someSelected = rows.some((row) => selected.has(row._id));

  return (
    <div className="table-container">
      <table id="records-table">
        <thead id="table-head">
          <tr>
            <th className="col-check">
              <MasterCheckbox
                checked={allSelected}
                indeterminate={!allSelected && someSelected}
                onChange={(event) => onToggleAll(event.target.checked)}
              />
            </th>
            {columns.map((column) => {
              const sortClass =
                sortCol === column ? (sortDir === "asc" ? "sorted-asc" : "sorted-desc") : "";

              return (
                <th
                  key={column}
                  className={sortClass}
                  data-col={column}
                  onClick={() => onSort(column)}
                >
                  {column}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody id="table-body">
          {rows.map((row) => {
            const isSelected = selected.has(row._id);

            return (
              <tr key={row._id} className={isSelected ? "selected" : ""}>
                <td className="col-check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleRow(row._id)}
                  />
                </td>
                {columns.map((column) => (
                  <td key={`${row._id}-${column}`} title={row[column]}>
                    {row[column]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
