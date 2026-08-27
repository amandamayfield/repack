import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/authContext";
import { useFetch } from "../hooks/useFetch";
import { computeProgress, groupByCategory } from "../lib/grouping";
import ProgressBar from "../components/ProgressBar";
import ItemRow from "../components/ItemRow";

export default function TripPage() {
  const { id } = useParams();
  const { handle403 } = useAuth();
  const { data: trip, loading, error, reload } = useFetch(`/trips/${id}/`);
  const { data: categories } = useFetch("/categories/");

  if (loading) return <p role="status">Loading trip…</p>;
  if (error) return <p role="alert">Could not load this trip.</p>;
  if (!trip) return null;

  return (
    <TripDetail
      trip={trip}
      categories={categories ?? []}
      reload={reload}
      handle403={handle403}
    />
  );
}

function TripDetail({ trip, categories, reload, handle403 }) {
  // Local optimistic mirror of the fetched items. Sync during render (not in an
  // effect) whenever a fresh trip arrives — the documented pattern for adjusting
  // state when a prop changes, and it keeps toggles instant without a refetch.
  const [items, setItems] = useState(trip.items ?? []);
  const [seenTrip, setSeenTrip] = useState(trip);
  if (seenTrip !== trip) {
    setSeenTrip(trip);
    setItems(trip.items ?? []);
  }

  const [toggleError, setToggleError] = useState(null);
  const overall = computeProgress(items);
  const groups = groupByCategory(items, categories);
  const complete = overall.total > 0 && overall.packed === overall.total;

  async function handleToggle(item, packed) {
    setToggleError(null);
    // Optimistic flip so the hero recomputes immediately.
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, packed } : it)),
    );
    try {
      await api(`/trip-items/${item.id}/`, { method: "PATCH", body: { packed } });
    } catch (err) {
      // Revert on failure so the checkbox never lies about server state.
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, packed: !packed } : it)),
      );
      if (!handle403(err)) setToggleError("Could not update that item. Please try again.");
    }
  }

  return (
    <section className="page trip-page">
      <h1>{trip.name}</h1>

      <div className="trip-hero">
        <ProgressBar
          value={overall.packed}
          max={overall.total}
          label={`${trip.name} packing progress`}
        />
        <p className="trip-hero__count">
          {overall.packed} / {overall.total} packed
          {complete && " — all packed! 🎉"}
        </p>
      </div>

      {toggleError && (
        <p role="alert" className="form-error">
          {toggleError}
        </p>
      )}

      {items.length === 0 ? (
        <p className="empty-state">
          No items yet. Add one below, or import a saved list.
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
                    packable
                    onToggle={handleToggle}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <AddItemForm
        tripId={trip.id}
        nextOrder={items.length}
        reload={reload}
        handle403={handle403}
      />
      <ImportListForm tripId={trip.id} reload={reload} handle403={handle403} />
    </section>
  );
}

function AddItemForm({ tripId, nextOrder, reload, handle403 }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      const body = { trip: tripId, name: trimmed, order: nextOrder };
      if (quantity !== "") body.quantity = Number(quantity);
      await api("/trip-items/", { method: "POST", body });
      setName("");
      setQuantity("");
      reload();
    } catch (err) {
      if (!handle403(err)) setError("Could not add the item. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="add-item-form">
      <h2>Add an item</h2>
      <label htmlFor="item-name">Item name</label>
      <input
        id="item-name"
        name="name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
      />
      <label htmlFor="item-qty">Quantity (optional)</label>
      <input
        id="item-qty"
        name="quantity"
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        disabled={pending}
      />
      <button type="submit" disabled={pending || name.trim() === ""}>
        {pending ? "Adding…" : "Add item"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}

function ImportListForm({ tripId, reload, handle403 }) {
  const { data: lists } = useFetch("/saved-lists/");
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleImport(event) {
    event.preventDefault();
    if (selected === "") return;
    setPending(true);
    setError(null);
    try {
      // NOTE: the real route is /import-list/ (AI-CONTEXT.md), not /import/.
      await api(`/trips/${tripId}/import-list/`, {
        method: "POST",
        body: { saved_list_id: Number(selected) },
      });
      setSelected("");
      reload();
    } catch (err) {
      if (!handle403(err)) setError("Could not import that list. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleImport} className="import-form">
      <h2>Import a saved list</h2>
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
      <button type="submit" disabled={pending || selected === ""}>
        {pending ? "Importing…" : "Import"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
