import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

let openSheetCount = 0;
let savedBodyOverflow = "";
const activeSheetStack = [];

export default function Sheet({
  open = false,
  onClose,
  title,
  subtitle,
  footer,
  children,
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const token = Symbol("sheet");
    activeSheetStack.push(token);

    if (openSheetCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("mt-sheet-open");
    }
    openSheetCount += 1;

    const handleKeyDown = (event) => {
      if (
        event.key === "Escape" &&
        activeSheetStack[activeSheetStack.length - 1] === token
      ) {
        onCloseRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const idx = activeSheetStack.lastIndexOf(token);
      if (idx !== -1) activeSheetStack.splice(idx, 1);

      openSheetCount = Math.max(0, openSheetCount - 1);
      if (openSheetCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        document.body.classList.remove("mt-sheet-open");
      }
    };
  }, [open]);

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
