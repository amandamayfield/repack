import { useState } from "react";
import { errorMessage } from "../api/ApiError";

// Create/edit form for a saved list's name and description. Without `onCancel`
// it's in create mode and clears itself after a successful save.
export default function ListForm({
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = "Save",
  idPrefix = "list",
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      const body = { name: trimmed };
      // Editing sends "" to clear the description; creating just leaves it out.
      if (description.trim() !== "" || onCancel)
        body.description = description.trim();
      await onSubmit(body);
      if (!onCancel) {
        setName("");
        setDescription("");
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the list. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form form--list">
      <div className="field field--grow">
        <label htmlFor={`${idPrefix}-name`}>List name</label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="field field--grow">
        <label htmlFor={`${idPrefix}-description`}>
          Description (optional)
        </label>
        <input
          id={`${idPrefix}-description`}
          name="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
