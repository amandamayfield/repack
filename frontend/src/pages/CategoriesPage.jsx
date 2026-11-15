import { useState } from "react";
import { api } from "../api/client";
import { errorMessage } from "../api/ApiError";
import { useDialog } from "../hooks/useDialog";
import { useFetch } from "../hooks/useFetch";

export default function CategoriesPage() {
  const { data: categories, loading, error, reload } = useFetch("/categories/");
  const { confirm, dialog } = useDialog();
  const [actionError, setActionError] = useState(null);

  async function handleDelete(category) {
    const ok = await confirm({
      title: `Delete "${category.name}"?`,
      message:
        "Items in this category on your lists and trips move to Uncategorized.",
    });
    if (!ok) return;
    setActionError(null);
    try {
      await api(`/categories/${category.id}/`, { method: "DELETE" });
      reload();
    } catch {
      setActionError(`Couldn't delete "${category.name}". Try again.`);
    }
  }

  return (
    <section className="page categories-page">
      {dialog}
      <header className="page-header">
        <div>
          <h1>Categories</h1>
          <p className="page-header__description">
            Group items on your lists and trips, like Clothes, Toiletries or
            Gear.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>New category</h2>
        <CategoryForm
          idPrefix="new-category"
          submitLabel="Add category"
          onSubmit={async (name) => {
            await api("/categories/", { method: "POST", body: { name } });
            reload();
          }}
        />
      </section>

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      {loading && <p role="status">Loading categories…</p>}
      {error && !loading && <p role="alert">Couldn't load your categories.</p>}
      {!loading && !error && categories?.length === 0 && (
        <p className="empty-state">
          No categories yet. Without any, everything is listed as Uncategorized.
        </p>
      )}
      {!loading && !error && categories?.length > 0 && (
        <ul className="list-index">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              reload={reload}
              onDelete={() => handleDelete(category)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoryRow({ category, reload, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="list-index__row list-index__row--editing">
        <CategoryForm
          initialName={category.name}
          idPrefix={`edit-category-${category.id}`}
          submitLabel="Save"
          onSubmit={async (name) => {
            await api(`/categories/${category.id}/`, {
              method: "PATCH",
              body: { name },
            });
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="list-index__row">
      <span className="list-index__name">{category.name}</span>
      <div className="item-row__actions">
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${category.name}`}
        >
          Rename
        </button>
        <button
          type="button"
          className="button button--ghost button--small button--quiet-danger"
          onClick={onDelete}
          aria-label={`Delete ${category.name}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function CategoryForm({
  initialName = "",
  idPrefix,
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      if (!onCancel) setName("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the category. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form form--inline">
      <div className="field field--grow">
        <label htmlFor={`${idPrefix}-name`}>Category name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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
