import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { errorMessage } from "../api/ApiError";
import { useFetch } from "../hooks/useFetch";

// Adds a section to a trip: one of your saved lists (each list fits once per
// trip, so lists already on it are left out) or a heading just for this trip.
export default function AddSectionForm({ tripId, listIdsOnTrip, onAdded }) {
  const { data: lists } = useFetch("/saved-lists/");
  const [selected, setSelected] = useState("");
  const [heading, setHeading] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const available = (lists ?? []).filter((l) => !listIdsOnTrip.includes(l.id));

  // Buttons stay disabled while a request is in flight, so a double click adds once.
  async function add(body, reset) {
    setPending(true);
    setError(null);
    try {
      await api("/trip-sections/", {
        method: "POST",
        body: { trip: tripId, ...body },
      });
      reset();
      onAdded();
    } catch (err) {
      setError(errorMessage(err, "Couldn't add that section. Try again."));
    } finally {
      setPending(false);
    }
  }

  function handleAddList(event) {
    event.preventDefault();
    if (selected === "") return;
    add({ saved_list: Number(selected) }, () => setSelected(""));
  }

  function handleAddHeading(event) {
    event.preventDefault();
    const name = heading.trim();
    if (!name) return;
    add({ name }, () => setHeading(""));
  }

  let listPicker;
  if (lists && lists.length === 0) {
    listPicker = (
      <p>
        You don't have any saved lists yet. <Link to="/lists">Make one</Link>
      </p>
    );
  } else if (lists && available.length === 0) {
    listPicker = <p>All your saved lists are on this trip.</p>;
  } else {
    listPicker = (
      <form onSubmit={handleAddList} className="form">
        <div className="field field--grow">
          <label htmlFor="add-section-list">Saved list</label>
          <select
            id="add-section-list"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
          >
            <option value="">Choose a list…</option>
            {available.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form__actions">
          <button
            type="submit"
            className="button"
            disabled={pending || selected === ""}
          >
            Add list
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className="panel add-section" aria-labelledby="add-section-title">
      <h2 id="add-section-title">Add a section</h2>
      {listPicker}
      <p className="add-section__or">or</p>
      <form onSubmit={handleAddHeading} className="form">
        <div className="field field--grow">
          <label htmlFor="add-section-name">
            New heading, just for this trip
          </label>
          <input
            id="add-section-name"
            type="text"
            maxLength={150}
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="form__actions">
          <button
            type="submit"
            className="button"
            disabled={pending || heading.trim() === ""}
          >
            Add heading
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
