import { useState } from "react";
import { errorMessage } from "../api/ApiError";
import ListChecklist from "./ListChecklist";

// Create/edit form for a trip's name and dates. Without `onCancel` it's
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
  const trimmed = name.trim();

  function missingDates() {
    if (startDate === "" && endDate === "")
      return "Add a start date and an end date.";
    if (startDate === "") return "Add a start date.";
    if (endDate === "") return "Add an end date.";
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!trimmed) return;
    const missing = missingDates();
    if (missing) {
      setError(missing);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = { name: trimmed, start_date: startDate, end_date: endDate };
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
    // noValidate: the browser's own "fill out this field" tooltip is small and brief,
    // so missing dates are explained in the form's alert instead.
    <form onSubmit={handleSubmit} className="form form--trip" noValidate>
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
        <label htmlFor={`${idPrefix}-start`}>Start date</label>
        <input
          id={`${idPrefix}-start`}
          name="start_date"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-end`}>End date</label>
        <input
          id={`${idPrefix}-end`}
          name="end_date"
          type="date"
          required
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
          disabled={pending || trimmed === ""}
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
