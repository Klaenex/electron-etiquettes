export default function PreviewModal({ open, html, countText, onClose, onPrint }) {
  if (!open) {
    return null;
  }

  return (
    <div id="modal-preview" className="modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-box">
        <div className="modal-header">
          <span>Apercu des etiquettes</span>
          <button className="modal-close" onClick={onClose}>
            x
          </button>
        </div>
        <div className="modal-body">
          <div id="label-preview-area" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="modal-footer">
          <span id="preview-count">{countText}</span>
          <button className="btn-primary" onClick={onPrint}>
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}
