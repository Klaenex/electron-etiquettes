export default function EmptyState({ onOpen }) {
  return (
    <div id="empty-state" className="empty-state">
      <div className="empty-icon">Table</div>
      <p>
        Ouvrez une base de donnees Access (.mdb / .accdb)
        <br />
        pour afficher les enregistrements.
      </p>
      <button id="btn-open-empty" onClick={onOpen}>
        Ouvrir une base de donnees...
      </button>
    </div>
  );
}
