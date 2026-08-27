import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/authContext";
import { useFetch } from "../hooks/useFetch";

export default function ListsPage() {
  const { handle403 } = useAuth();
  const { data: lists, loading, error, reload } = useFetch("/saved-lists/");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setFormError(null);
    try {
      const body = { name: trimmed };
      if (description.trim() !== "") body.description = description.trim();
      await api("/saved-lists/", { method: "POST", body });
      setName("");
      setDescription("");
      reload();
    } catch (err) {
      if (!handle403(err)) setFormError("Could not create the list. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(list) {
    if (!window.confirm(`Delete "${list.name}"? This can't be undone.`)) return;
    try {
      await api(`/saved-lists/${list.id}/`, { method: "DELETE" });
      reload();
    } catch (err) {
      if (!handle403(err)) setFormError("Could not delete the list. Please try again.");
    }
  }

  return (
    <section className="page lists-page">
      <h1>Saved lists</h1>

      <form onSubmit={handleCreate} className="create-form">
        <label htmlFor="list-name">List name</label>
        <input
          id="list-name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />
        <label htmlFor="list-description">Description (optional)</label>
        <input
          id="list-description"
          name="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
        />
        <button type="submit" disabled={pending || name.trim() === ""}>
          {pending ? "Creating…" : "Add list"}
        </button>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
      </form>

      {loading && <p role="status">Loading lists…</p>}
      {error && !loading && <p role="alert">Could not load your saved lists.</p>}

      {!loading && !error && lists?.length === 0 && (
        <p className="empty-state">No saved lists yet. Create one above.</p>
      )}

      {!loading && !error && lists?.length > 0 && (
        <ul className="list-index">
          {lists.map((list) => (
            <li key={list.id} className="list-index__row">
              <Link to={`/lists/${list.id}`}>{list.name}</Link>
              <button type="button" onClick={() => handleDelete(list)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
