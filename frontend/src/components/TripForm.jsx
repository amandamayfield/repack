import { useState } from "react";
import { errorMessage } from "../api/ApiError";
import ListChecklist from "./ListChecklist";

// Create/edit form for a trip's name and optional dates. Without `onCancel` it's
// in create mode and clears itself after a successful save. Given `lists`, it
// also offers saved lists to start the trip with.
export default function TripForm({
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = "Save",
  idPrefix = "trip",
  lists,
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [startDate, setStartDate] = useState(initial.start_date ?? "");
  const [endDate, setEndDate] = useState(initial.end_date ?? "");
  const [selectedLists, setSelectedLists] = useState([]);
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
      // Editing sends null to clear a date; creating just leaves it out.
      if (startDate !== "" || onCancel) body.start_date = startDate || null;
      if (endDate !== "" || onCancel) body.end_date = endDate || null;
      if (selectedLists.length > 0) body.saved_lists = selectedLists;
      await onSubmit(body);
      if (!onCancel) {
        setName("");
        setStartDate("");
        setEndDate("");
        setSelectedLists([]);
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the trip. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form form--trip">
      <div className="field field--grow">
        <label htmlFor={`${idPrefix}-name`}>Trip name</label>
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

      <div className="field">
        <label htmlFor={`${idPrefix}-start`}>Start date (optional)</label>
        <input
          id={`${idPrefix}-start`}
          name="start_date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-end`}>End date (optional)</label>
        <input
          id={`${idPrefix}-end`}
          name="end_date"
          type="date"
          min={startDate || undefined}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          disabled={pending}
        />
      </div>

      {lists?.length > 0 && (
        <ListChecklist
          legend="Add your saved lists (optional)"
          lists={lists}
          selected={selectedLists}
          onChange={setSelectedLists}
          disabled={pending}
        />
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
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
