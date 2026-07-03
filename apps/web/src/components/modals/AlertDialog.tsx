interface Props {
  message: string;
  onClose: () => void;
}

export function AlertDialog({ message, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
