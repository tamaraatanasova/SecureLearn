import { useEffect } from "react";

export default function Modal({ open, title, onClose, children, labelledById }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
      >
        <div className="modalHeader">
          <div className="modalTitle" id={labelledById}>{title}</div>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modalBody">
          {children}
        </div>
      </div>
    </div>
  );
}

