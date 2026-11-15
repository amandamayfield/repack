import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useDialog } from "../hooks/useDialog";
import { useFetch } from "../hooks/useFetch";
import ItemForm from "../components/ItemForm";
import ItemRow from "../components/ItemRow";
import ListForm from "../components/ListForm";

export default function ListEditorPage() {
  const { id } = useParams();
  const {
    data: list,
    loading,
    error,
    reload,
  } = useFetch(`/saved-lists/${id}/`);
  const { confirm, dialog } = useDialog();
  const [editingDetails, setEditingDetails] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading) return <p role="status">Loading list…</p>;
  if (error) return <p role="alert">Couldn't load this list.</p>;
  if (!list) return null;

  // Errors propagate to ItemForm / ListForm, which show them.
  async function handleAdd(body) {
    await api("/saved-list-items/", {
      method: "POST",
      body: { saved_list: list.id, ...body },
    });
    reload();
  }

  async function handleDeleteItem(item) {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      message:
        "It will also come off your current and upcoming trips. Past trips keep it.",
    });
    if (!ok) return;
    setActionError(null);
    try {
      await api(`/saved-list-items/${item.id}/`, { method: "DELETE" });
      reload();
    } catch {
      setActionError(`Couldn't delete "${item.name}". Try again.`);
    }
  }

  return (
    <section className="page list-editor">
      {dialog}
      <p className="back-link">
        <Link to="/lists">← All lists</Link>
      </p>

      {editingDetails ? (
        <section className="panel" aria-label="Edit list details">
          <h1 className="visually-hidden">{list.name}</h1>
          <ListForm
            initial={list}
            idPrefix="edit-list"
            submitLabel="Save list"
            onSubmit={async (body) => {
              await api(`/saved-lists/${list.id}/`, { method: "PATCH", body });
              setEditingDetails(false);
              reload();
            }}
            onCancel={() => setEditingDetails(false)}
          />
        </section>
      ) : (
        <header className="page-header">
          <div>
            <h1>{list.name}</h1>
            {list.description && (
              <p className="page-header__description">{list.description}</p>
            )}
          </div>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setEditingDetails(true)}
          >
            Edit details
          </button>
        </header>
      )}

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}

      {list.items.length === 0 ? (
        <p className="empty-state">
          This list is empty. Add the things you always bring below.
        </p>
      ) : (
        <ul className="item-list">
          {list.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onSave={async (body) => {
                await api(`/saved-list-items/${item.id}/`, {
                  method: "PATCH",
                  body,
                });
                reload();
              }}
              onDelete={() => handleDeleteItem(item)}
            />
          ))}
        </ul>
      )}

      <section className="panel">
        <h2>Add an item</h2>
        <ItemForm onSubmit={handleAdd} submitLabel="Add item" idPrefix="add" />
      </section>
    </section>
  );
}
