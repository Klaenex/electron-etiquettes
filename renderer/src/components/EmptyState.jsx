export default function EmptyState({ sourceMode, onOpen, onOpenServer }) {
  const isServerMode = sourceMode === "server";

  return (
    <div id="empty-state" className="empty-state">
      <div className="empty-icon">Table</div>
      <p>
        {isServerMode ? "Aucun contact trouve." : "Ouvrez une source de donnees."}
        <br />
        Access (.mdb / .accdb) ou connexion securisee.
      </p>
      <div className="empty-actions">
        <button id="btn-open-empty" onClick={onOpen}>
          Ouvrir Access...
        </button>
        <button onClick={onOpenServer}>
          Connexion...
        </button>
      </div>
    </div>
  );
}
