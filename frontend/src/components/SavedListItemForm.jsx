import { useState } from "react";

// Shared add/edit form for a saved-list (template) item. The parent injects
// saved_list/order and decides POST vs PATCH; this form only owns the editable
// fields (name, optional quantity, optional category). `onSubmit(body)` returns a
// promise — the form manages its own pending/error state around it.
export default function SavedListItemForm({
  initial = {},
  categories,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  idPrefix = "item",
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [quantity, setQuantity] = useState(
    initial.quantity != null ? String(initial.quantity) : "",
  );
  const [category, setCategory] = useState(
    initial.category != null ? String(initial.category) : "",
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
        category: category === "" ? null : Number(category),
      });
      if (!onCancel) {
        // Add mode (no cancel handler) reuses the form, so reset it.
        setName("");
        setQuantity("");
        setCategory("");
      }
    } catch (err) {
      // handle403 lives in the parent; a thrown error here just re-enables the form.
      setError(err?.handled ? null : "Could not save the item. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="item-form">
      <label htmlFor={`${idPrefix}-name`}>Item name</label>
      <input
        id={`${idPrefix}-name`}
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
      />

      <label htmlFor={`${idPrefix}-qty`}>Quantity (optional)</label>
      <input
        id={`${idPrefix}-qty`}
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        disabled={pending}
      />

      <label htmlFor={`${idPrefix}-category`}>Category (optional)</label>
      <select
        id={`${idPrefix}-category`}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={pending}
      >
        <option value="">Uncategorized</option>
        {(categories ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <button type="submit" disabled={pending || name.trim() === ""}>
        {pending ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
