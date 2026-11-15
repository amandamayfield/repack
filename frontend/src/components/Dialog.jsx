import { useEffect, useId, useRef, useState } from "react";

// Modal built on the native <dialog>: showModal() gives focus trapping, Esc to
// close and an inert background for free. Rendered by useDialog(); pages don't
// use this directly.
export default function Dialog({
  kind, // "confirm" (two buttons) | "alert" (one button) | "prompt" (text field + two buttons)
  title,
  message,
  label,
  initialValue = "",
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const isConfirm = kind === "confirm";
  const isPrompt = kind === "prompt";
  const trimmed = value.trim();

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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isPrompt && !trimmed) return;
          onConfirm(isPrompt ? trimmed : undefined);
        }}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        {message && <p className="dialog__message">{message}</p>}
        {isPrompt && (
          <div className="field dialog__field">
            <label htmlFor={inputId}>{label}</label>
            <input
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={150}
              autoFocus
            />
          </div>
        )}
        <div className="dialog__actions">
          {(isConfirm || isPrompt) && (
            // On a confirm, focus the safe choice first, so a stray Enter doesn't delete.
            <button
              type="button"
              className="button button--ghost"
              onClick={onCancel}
              autoFocus={isConfirm}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="submit"
            className={isConfirm ? "button button--danger" : "button"}
            autoFocus={kind === "alert"}
            disabled={isPrompt && !trimmed}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
