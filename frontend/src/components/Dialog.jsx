import { useEffect, useId, useRef } from "react";

// Modal built on the native <dialog>: showModal() gives focus trapping, Esc to
// close and an inert background for free. Rendered by useDialog(); pages don't
// use this directly.
export default function Dialog({
  kind, // "confirm" (two buttons) | "alert" (one button)
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const isConfirm = kind === "confirm";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // Esc fires "cancel"; route it through our state instead of letting the
      // browser close the element behind React's back.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      {message && <p className="dialog__message">{message}</p>}
      <div className="dialog__actions">
        {isConfirm && (
          // Focus the safe choice first, so a stray Enter doesn't delete.
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            autoFocus
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          className={isConfirm ? "button button--danger" : "button"}
          onClick={onConfirm}
          autoFocus={!isConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
