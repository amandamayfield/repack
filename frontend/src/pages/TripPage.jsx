import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useDialog } from "../hooks/useDialog";
import { useFetch } from "../hooks/useFetch";
import { computeProgress, groupByCategory } from "../lib/grouping";
import { formatDateRange } from "../lib/dates";
import ProgressRing from "../components/ProgressRing";
import ItemRow from "../components/ItemRow";
import ItemForm from "../components/ItemForm";
import TripForm from "../components/TripForm";

export default function TripPage() {
  const { id } = useParams();
  const { data: trip, loading, error, reload } = useFetch(`/trips/${id}/`);
  const { data: categories } = useFetch("/categories/");

  if (loading) return <p role="status">Loading trip…</p>;
  if (error) return <p role="alert">Couldn't load this trip.</p>;
  if (!trip) return null;

  return (
    <TripDetail trip={trip} categories={categories ?? []} reload={reload} />
  );
}

function TripDetail({ trip, categories, reload }) {
  const navigate = useNavigate();
  const { confirm, alert, prompt, dialog } = useDialog();
  const [editingTrip, setEditingTrip] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [savedList, setSavedList] = useState(null); // { id, name } after "Save as list"

  // Local optimistic mirror of the fetched items. Sync during render (not in an
  // effect) whenever a fresh trip arrives — the documented pattern for adjusting
  // state when a prop changes, and it keeps toggles instant without a refetch.
  const [items, setItems] = useState(trip.items ?? []);
  const [seenTrip, setSeenTrip] = useState(trip);
  if (seenTrip !== trip) {
    setSeenTrip(trip);
    setItems(trip.items ?? []);
  }

  const overall = computeProgress(items);
  const groups = groupByCategory(items, categories);
  const dates = formatDateRange(trip.start_date, trip.end_date);

  async function handleToggle(item, packed) {
    setActionError(null);
    // Optimistic flip so the ring recomputes immediately.
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, packed } : it)),
    );
    try {
      await api(`/trip-items/${item.id}/`, {
        method: "PATCH",
        body: { packed },
      });
    } catch {
      // Revert on failure so the checkbox never lies about server state.
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, packed: !packed } : it)),
      );
      setActionError("Couldn't update that item. Try again.");
    }
  }

  async function handleDeleteItem(item) {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      message: "It's removed from this trip only. Your saved lists keep it.",
    });
    if (!ok) return;
    setActionError(null);
    try {
      await api(`/trip-items/${item.id}/`, { method: "DELETE" });
      reload();
    } catch {
      setActionError(`Couldn't delete "${item.name}". Try again.`);
    }
  }

  async function handleDuplicate() {
    setActionError(null);
    try {
      const copy = await api(`/trips/${trip.id}/duplicate/`, {
        method: "POST",
      });
      navigate(`/trips/${copy.id}`);
    } catch {
      setActionError("Couldn't duplicate this trip. Try again.");
    }
  }

  async function handleSaveAsList() {
    const name = await prompt({
      title: "Save as a list",
      message:
        "Make a saved list from this trip's items, to reuse on future trips.",
      label: "List name",
      initialValue: trip.name,
      confirmLabel: "Save list",
    });
    if (name === null) return;
    setActionError(null);
    setSavedList(null);
    try {
      setSavedList(
        await api(`/trips/${trip.id}/save-as-list/`, {
          method: "POST",
          body: { name },
        }),
      );
    } catch {
      setActionError("Couldn't save this trip as a list. Try again.");
    }
  }

  async function handleDeleteTrip() {
    const ok = await confirm({
      title: `Delete "${trip.name}"?`,
      message:
        "This deletes the trip and its packing list. Saved lists aren't affected.",
      confirmLabel: "Delete trip",
    });
    if (!ok) return;
    try {
      await api(`/trips/${trip.id}/`, { method: "DELETE" });
      navigate("/trips");
    } catch {
      setActionError("Couldn't delete this trip. Try again.");
    }
  }

  return (
    <section className="page trip-page">
      {dialog}
      <p className="back-link">
        <Link to="/trips">← All trips</Link>
      </p>

      {editingTrip ? (
        <section className="panel" aria-label="Edit trip">
          <h1 className="visually-hidden">{trip.name}</h1>
          <TripForm
            initial={trip}
            idPrefix="edit-trip"
            submitLabel="Save trip"
            onSubmit={async (body) => {
              await api(`/trips/${trip.id}/`, { method: "PATCH", body });
              setEditingTrip(false);
              reload();
            }}
            onCancel={() => setEditingTrip(false)}
          />
        </section>
      ) : (
        <header className="trip-hero">
          <ProgressRing
            value={overall.packed}
            max={overall.total}
            label={`${trip.name} packing progress`}
          />
          <div className="trip-hero__text">
            <h1>{trip.name}</h1>
            {dates && <p className="trip-hero__dates">{dates}</p>}
            <p className="trip-hero__count">
              {overall.packed} / {overall.total} packed
            </p>
            <div className="trip-hero__actions">
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={handleDuplicate}
              >
                Duplicate trip
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={handleSaveAsList}
              >
                Save as list
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setEditingTrip(true)}
              >
                Edit trip
              </button>
              <button
                type="button"
                className="button button--ghost button--small button--quiet-danger"
                onClick={handleDeleteTrip}
              >
                Delete trip
              </button>
            </div>
          </div>
        </header>
      )}

      {savedList && (
        <p role="status" className="form-note">
          Saved as a list:{" "}
          <Link to={`/lists/${savedList.id}`}>{savedList.name}</Link>
        </p>
      )}

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}

      {items.length === 0 ? (
        <p className="empty-state">
          Nothing to pack yet. Add an item below, or import one of your saved
          lists.
        </p>
      ) : (
        groups.map((group) => {
          const gp = computeProgress(group.items);
          return (
            <section key={group.name} className="category-group">
              <h2 className="category-group__header">
                {group.name}{" "}
                <span className="category-group__count">
                  {gp.packed}/{gp.total}
                </span>
              </h2>
              <ul className="item-list">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    categories={categories}
                    onToggle={handleToggle}
                    onSave={async (body) => {
                      await api(`/trip-items/${item.id}/`, {
                        method: "PATCH",
                        body,
                      });
                      reload();
                    }}
                    onDelete={() => handleDeleteItem(item)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <div className="trip-page__tools">
        <section className="panel add-item-form">
          <h2>Add an item</h2>
          <ItemForm
            categories={categories}
            onSubmit={async (body) => {
              await api("/trip-items/", {
                method: "POST",
                body: { trip: trip.id, ...body },
              });
              reload();
            }}
            submitLabel="Add item"
            idPrefix="trip-add"
          />
        </section>
        <ImportListForm
          tripId={trip.id}
          importedListIds={trip.imported_lists ?? []}
          reload={reload}
          alert={alert}
        />
      </div>
    </section>
  );
}

function ImportListForm({ tripId, importedListIds, reload, alert }) {
  const { data: lists } = useFetch("/saved-lists/");
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function alertAlreadyImported(listId) {
    const name = lists?.find((l) => l.id === listId)?.name ?? "That list";
    return alert({
      title: "Already imported",
      message: `"${name}" has already been imported into this trip.`,
    });
  }

  async function handleImport(event) {
    event.preventDefault();
    if (selected === "") return;
    const listId = Number(selected);
    // Each list can only be imported into a trip once (the server enforces it too).
    if (importedListIds.includes(listId)) {
      alertAlreadyImported(listId);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api(`/trips/${tripId}/import-list/`, {
        method: "POST",
        body: { saved_list_id: listId },
      });
      setSelected("");
      reload();
    } catch (err) {
      if (err?.status === 409) {
        // Imported elsewhere (e.g. another tab) since this page loaded; resync.
        alertAlreadyImported(listId);
        setSelected("");
        reload();
      } else {
        setError("Couldn't import that list. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleImport} className="panel form import-form">
      <h2>Import a saved list</h2>
      <div className="field field--grow">
        <label htmlFor="import-list">Saved list</label>
        <select
          id="import-list"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
        >
          <option value="">Choose a list…</option>
          {(lists ?? []).map((list) => (
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
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
