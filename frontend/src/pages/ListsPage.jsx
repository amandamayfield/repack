import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useDialog } from "../hooks/useDialog";
import { useFetch } from "../hooks/useFetch";
import ListForm from "../components/ListForm";

export default function ListsPage() {
  const { data: lists, loading, error, reload } = useFetch("/saved-lists/");
  const { confirm, dialog } = useDialog();
  const [actionError, setActionError] = useState(null);

  async function handleDelete(list) {
    const ok = await confirm({
      title: `Delete "${list.name}"?`,
      message:
        "This can't be undone. Trips you've already imported it into keep their items.",
      confirmLabel: "Delete list",
    });
    if (!ok) return;
    setActionError(null);
    try {
      await api(`/saved-lists/${list.id}/`, { method: "DELETE" });
      reload();
    } catch {
      setActionError(`Couldn't delete "${list.name}". Try again.`);
    }
  }

  return (
    <section className="page lists-page">
      {dialog}
      <header className="page-header">
        <div>
          <h1>Saved lists</h1>
          <p className="page-header__description">
            The things you always bring, ready to import into any trip.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>New list</h2>
        <ListForm
          submitLabel="Add list"
          onSubmit={async (body) => {
            await api("/saved-lists/", { method: "POST", body });
            reload();
          }}
        />
      </section>

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      {loading && <p role="status">Loading lists…</p>}
      {error && !loading && <p role="alert">Couldn't load your saved lists.</p>}

      {!loading && !error && lists?.length === 0 && (
        <p className="empty-state">
          No saved lists yet. Start one above, like "Camping" or "Weekend away".
        </p>
      )}

      {!loading && !error && lists?.length > 0 && (
        <ul className="list-index">
          {lists.map((list) => (
            <li key={list.id} className="list-index__row">
              <div>
                <Link to={`/lists/${list.id}`} className="list-index__name">
                  {list.name}
                </Link>
                {list.description && (
                  <p className="list-index__description">{list.description}</p>
                )}
              </div>
              <button
                type="button"
                className="button button--ghost button--small button--quiet-danger"
                onClick={() => handleDelete(list)}
                aria-label={`Delete ${list.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
