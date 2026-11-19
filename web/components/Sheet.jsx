import React, { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function Sheet({
  open = false,
  onClose,
  title,
  subtitle,
  footer,
  children,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const content = (
    <div
      className="mt-sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="mt-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        <div className="mt-sheet-handle" aria-hidden="true" />
        <div className="mt-sheet-head">
          <div className="mt-sheet-head-copy">
            {title && (
              <h2 id={titleId} className="mt-sheet-title">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-card-sub">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Закрыть"
            onClick={() => onClose?.()}
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-sheet-body">{children}</div>

        {footer ? <div className="mt-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : content;
}
