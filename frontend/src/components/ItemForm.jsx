import { useRef, useState } from "react";
import { errorMessage } from "../api/ApiError";

// Shared add/edit form for an item on a saved list or a trip. The parent adds
// the parent id (saved_list / trip) and decides POST vs PATCH; this form only
// owns the editable fields (name, optional quantity). `lockName` shows the name
// as text instead, for trip items synced from a saved list.
// `onSubmit(body)` returns a promise — the form manages pending/error around it.
// `onFollowList` (a synced item with the trip's own amount) offers the list's amount back.
// `onMove(direction)` adds Move up / Move down, disabled where `canMoveUp` / `canMoveDown` is false.
export default function ItemForm({
  initial = {},
  lockName = false,
  onSubmit,
  onFollowList,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
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
  const nameInput = useRef(null);
  const moving = useRef(false);

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
        // Clicking Add moved focus to the button; bring it back for the next item.
        nameInput.current.focus();
      }
    } catch (err) {
      // A 401 is handled globally (redirect to login); anything else is shown here.
      setError(errorMessage(err, "Couldn't save the item. Try again."));
    } finally {
      setPending(false);
    }
  }

  async function handleFollowList() {
    setPending(true);
    setError(null);
    try {
      await onFollowList();
    } catch (err) {
      setError(errorMessage(err, "Couldn't use the list's amount. Try again."));
    } finally {
      setPending(false);
    }
  }

  // Guarded by a ref, not by disabling the button: that would drop keyboard focus on every step.
  async function handleMove(direction) {
    if (moving.current) return;
    moving.current = true;
    setError(null);
    try {
      await onMove(direction);
    } catch (err) {
      setError(errorMessage(err, "Couldn't move the item. Try again."));
    } finally {
      moving.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form form--item">
      {lockName ? (
        <div className="field field--grow">
          <span className="item-form__name">{name}</span>
          <span className="field__hint">
            Change the name on its saved list.
          </span>
        </div>
      ) : (
        <div className="field field--grow">
          <label htmlFor={`${idPrefix}-name`}>Item name</label>
          <input
            ref={nameInput}
            id={`${idPrefix}-name`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Not disabled: that drops focus, and the submit button already blocks a second save.
            readOnly={pending}
          />
        </div>
      )}

      <div className="field field--narrow">
        <label htmlFor={`${idPrefix}-qty`}>Quantity (optional)</label>
        <input
          id={`${idPrefix}-qty`}
          type="number"
          inputMode="numeric"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          readOnly={pending}
        />
      </div>

      {onFollowList && (
        <div className="field">
          <span className="field__hint">
            {initial.list_quantity == null
              ? "Your saved list has no amount."
              : `Your saved list's amount is ${initial.list_quantity}.`}
          </span>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={handleFollowList}
            disabled={pending}
          >
            Use the list's amount
          </button>
        </div>
      )}

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
      {onMove && (
        <div className="form__actions">
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => handleMove("up")}
            disabled={!canMoveUp}
            aria-label={`Move ${initial.name} up`}
          >
            Move up
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => handleMove("down")}
            disabled={!canMoveDown}
            aria-label={`Move ${initial.name} down`}
          >
            Move down
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
