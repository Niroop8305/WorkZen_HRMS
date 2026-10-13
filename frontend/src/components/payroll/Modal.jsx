// Lightweight modal shell reused by the salary configuration forms. Mirrors the
// payslip modal markup so styling (.payslip-modal-overlay / .payslip-modal) is
// shared and consistent across the payroll admin UI.
const Modal = ({ title, onClose, children }) => (
  <div className="payslip-modal-overlay" onClick={onClose}>
    <div className="payslip-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

export default Modal;
