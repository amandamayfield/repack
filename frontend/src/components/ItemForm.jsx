import { useState } from "react";
import { errorMessage } from "../api/ApiError";

// Shared add/edit form for an item on a saved list or a trip. The parent adds
// the parent id (saved_list / trip) and decides POST vs PATCH; this form only
// owns the editable fields (name, optional quantity).
// `onSubmit(body)` returns a promise — the form manages pending/error around it.
export default function ItemForm({
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = "Save",
  idPrefix = "item",
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [quantity, setQuantity] = useState(
    initial.quantity != null ? String(initial.quantity) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmed,
        quantity: quantity === "" ? null : Number(quantity),
      });
      if (!onCancel) {
        // Add mode (no cancel handler) reuses the form, so reset it.
        setName("");
        setQuantity("");
      }
    } catch (err) {
      // A 401 is handled globally (redirect to login); anything else is shown here.
      setError(errorMessage(err, "Couldn't save the item. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form form--item">
      <div className="field field--grow">
        <label htmlFor={`${idPrefix}-name`}>Item name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="field field--narrow">
        <label htmlFor={`${idPrefix}-qty`}>Quantity (optional)</label>
        <input
          id={`${idPrefix}-qty`}
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="form__actions">
        <button
          type="submit"
          className="button"
          disabled={pending || name.trim() === ""}
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
