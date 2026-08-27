import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/authContext";
import { useFetch } from "../hooks/useFetch";
import { groupByCategory } from "../lib/grouping";
import SavedListItemForm from "../components/SavedListItemForm";

export default function ListEditorPage() {
  const { id } = useParams();
  const { handle403 } = useAuth();
  const { data: list, loading, error, reload } = useFetch(`/saved-lists/${id}/`);
  const { data: categories } = useFetch("/categories/");

  if (loading) return <p role="status">Loading list…</p>;
  if (error) return <p role="alert">Could not load this list.</p>;
  if (!list) return null;

  async function handleAdd(body) {
    try {
      await api("/saved-list-items/", {
        method: "POST",
        body: { saved_list: list.id, order: list.items.length, ...body },
      });
      reload();
    } catch (err) {
      if (handle403(err)) return; // redirecting to login; treat as resolved
      throw err; // let the form surface a generic error
    }
  }

  const groups = groupByCategory(list.items, categories ?? []);

  return (
    <section className="page list-editor">
      <p>
        <Link to="/lists">← All lists</Link>
      </p>
      <h1>{list.name}</h1>
      {list.description && <p className="list-editor__description">{list.description}</p>}

      {list.items.length === 0 ? (
        <p className="empty-state">No items yet. Add one below.</p>
      ) : (
        groups.map((group) => (
          <section key={group.name} className="category-group">
            <h2 className="category-group__header">{group.name}</h2>
            <ul className="item-list">
              {group.items.map((item) => (
                <EditableItemRow
                  key={item.id}
                  item={item}
                  categories={categories ?? []}
                  reload={reload}
                  handle403={handle403}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <h2>Add an item</h2>
      <SavedListItemForm
        categories={categories ?? []}
        onSubmit={handleAdd}
        submitLabel="Add item"
        idPrefix="add"
      />
    </section>
  );
}

function EditableItemRow({ item, categories, reload, handle403 }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const text = item.quantity ? `${item.name} (${item.quantity})` : item.name;

  async function handleEdit(body) {
    try {
      await api(`/saved-list-items/${item.id}/`, { method: "PATCH", body });
      setEditing(false);
      reload();
    } catch (err) {
      if (handle403(err)) return;
      throw err; // surfaced by the form
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setError(null);
    try {
      await api(`/saved-list-items/${item.id}/`, { method: "DELETE" });
      reload();
    } catch (err) {
      if (!handle403(err)) setError("Could not delete the item. Please try again.");
    }
  }

  if (editing) {
    return (
      <li className="item-row item-row--editing">
        <SavedListItemForm
          initial={item}
          categories={categories}
          onSubmit={handleEdit}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          idPrefix={`edit-${item.id}`}
        />
      </li>
    );
  }

  return (
    <li className="item-row">
      <span>{text}</span>
      <button type="button" onClick={() => setEditing(true)}>
        Edit
      </button>
      <button type="button" onClick={handleDelete}>
        Delete
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </li>
  );
}
