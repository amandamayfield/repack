import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { errorMessage } from "../api/ApiError";
import { useDialog } from "../hooks/useDialog";
import { useFetch } from "../hooks/useFetch";
import { computeProgress } from "../lib/progress";
import { formatDateRange, sameLengthFromToday } from "../lib/dates";
import { readFlag, writeFlag } from "../lib/remember";
import ProgressRing from "../components/ProgressRing";
import TripForm from "../components/TripForm";
import TripSection from "../components/TripSection";
import AddSectionForm from "../components/AddSectionForm";

export default function TripPage() {
  const { id } = useParams();
  const { data: trip, loading, error, reload } = useFetch(`/trips/${id}/`);

  if (loading) return <p role="status">Loading trip…</p>;
  if (error) return <p role="alert">Couldn't load this trip.</p>;
  if (!trip) return null;

  return <TripDetail trip={trip} reload={reload} />;
}

function TripDetail({ trip, reload }) {
  const navigate = useNavigate();
  const { confirm, prompt, dialog } = useDialog();
  const [editingTrip, setEditingTrip] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const hidePackedKey = `repack.hide-packed.${trip.id}`;
  const [hidePacked, setHidePacked] = useState(() => readFlag(hidePackedKey));

  // Local optimistic mirror of the fetched sections. Sync during render (not in an
  // effect) whenever a fresh trip arrives — the documented pattern for adjusting
  // state when a prop changes, and it keeps toggles instant without a refetch.
  const [sections, setSections] = useState(trip.sections ?? []);
  const [seenTrip, setSeenTrip] = useState(trip);
  if (seenTrip !== trip) {
    setSeenTrip(trip);
    setSections(trip.sections ?? []);
  }

  const allItems = sections.flatMap((s) => s.items);
  const overall = computeProgress(allItems);
  const dates = formatDateRange(trip.start_date, trip.end_date);

  // The same item in two sections shares its tick; the server does the same.
  function withSameItems(items) {
    const names = new Set(items.map((i) => i.name.toLowerCase()));
    return allItems.filter((i) => names.has(i.name.toLowerCase()));
  }

  function otherSectionsWith(item, section) {
    const key = item.name.toLowerCase();
    return sections
      .filter(
        (s) =>
          s.id !== section.id &&
          s.items.some((i) => i.name.toLowerCase() === key),
      )
      .map((s) => s.name);
  }

  function setPacked(itemIds, packed) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.map((i) =>
          itemIds.includes(i.id) ? { ...i, packed } : i,
        ),
      })),
    );
  }

  function toggleHidePacked() {
    setHidePacked(!hidePacked);
    writeFlag(hidePackedKey, !hidePacked);
  }

  async function handleToggle(item, packed) {
    setActionError(null);
    // Optimistic flip so the ring recomputes immediately.
    const changed = withSameItems([item])
      .filter((i) => i.packed !== packed)
      .map((i) => i.id);
    setPacked(changed, packed);
    try {
      await api(`/trip-items/${item.id}/`, {
        method: "PATCH",
        body: { packed },
      });
    } catch (err) {
      // Revert on failure so the checkbox never lies about server state.
      setPacked(changed, !packed);
      setActionError(
        errorMessage(err, "Couldn't update that item. Try again."),
      );
    }
  }

  // With no section, unticks the whole trip.
  async function handleUntickAll(section) {
    const ok = await confirm(
      section
        ? {
            title: `Untick everything in "${section.name}"?`,
            message:
              "The items stay on this trip. Only their ticks are cleared.",
            confirmLabel: "Untick all",
          }
        : {
            title: "Start repacking?",
            message:
              "This unticks every item on this trip, so you can pack it again.",
            confirmLabel: "Untick all",
          },
    );
    if (!ok) return;
    setActionError(null);
    const items = section ? withSameItems(section.items) : allItems;
    // Remember exactly what was ticked, so a failed save restores only those.
    const ticked = items.filter((i) => i.packed).map((i) => i.id);
    setPacked(ticked, false);
    try {
      await api(
        `/trips/${trip.id}/untick-all/`,
        section
          ? { method: "POST", body: { section: section.id } }
          : { method: "POST" },
      );
    } catch (err) {
      setPacked(ticked, true);
      setActionError(
        errorMessage(err, "Couldn't untick those items. Try again."),
      );
    }
  }

  async function run(request, failure) {
    setActionError(null);
    try {
      await request();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, failure));
    }
  }

  async function handleRename(section) {
    const name = await prompt({
      title: "Rename section",
      message: section.is_synced
        ? "This renames it on this trip only. Your saved list keeps its name."
        : undefined,
      label: "Section name",
      initialValue: section.name,
      confirmLabel: "Rename",
    });
    if (name === null) return;
    run(
      () =>
        api(`/trip-sections/${section.id}/`, {
          method: "PATCH",
          body: { name },
        }),
      `Couldn't rename "${section.name}". Try again.`,
    );
  }

  function handleMove(section, step) {
    const ids = sections.map((s) => s.id);
    const from = ids.indexOf(section.id);
    [ids[from], ids[from + step]] = [ids[from + step], ids[from]];
    run(
      () =>
        api(`/trips/${trip.id}/reorder-sections/`, {
          method: "POST",
          body: { section_ids: ids },
        }),
      `Couldn't move "${section.name}". Try again.`,
    );
  }

  async function handleRemove(section) {
    const ok = await confirm({
      title: `Remove "${section.name}" from this trip?`,
      message: section.is_synced
        ? "Its items and ticks on this trip go too. Your saved list isn't affected, and you can add it again later."
        : "Its items go too. This can't be undone.",
      confirmLabel: "Remove section",
    });
    if (!ok) return;
    run(
      () => api(`/trip-sections/${section.id}/`, { method: "DELETE" }),
      `Couldn't remove "${section.name}". Try again.`,
    );
  }

  // Errors propagate to ItemForm, which shows them.
  async function handleAddItem(section, body) {
    await api("/trip-items/", {
      method: "POST",
      body: { section: section.id, ...body },
    });
    reload();
  }

  async function handleSaveItem(item, body) {
    await api(`/trip-items/${item.id}/`, { method: "PATCH", body });
    reload();
  }

  // Errors propagate to ItemForm, which shows them.
  async function handleMoveItem(item, direction) {
    await api(`/trip-items/${item.id}/move/`, {
      method: "POST",
      body: { direction },
    });
    reload();
  }

  // Errors propagate to ItemForm, which shows them.
  async function handleFollowListItem(item) {
    await api(`/trip-items/${item.id}/follow-list/`, { method: "POST" });
    reload();
  }

  async function handleDeleteItem(item) {
    const ok = await confirm(
      item.is_synced
        ? {
            title: `Remove "${item.name}" from this trip?`,
            message:
              "Your saved list keeps it, but it won't come back to this trip when the list changes.",
            confirmLabel: "Remove",
          }
        : {
            title: `Delete "${item.name}"?`,
            message: "It's only on this trip, so this can't be undone.",
          },
    );
    if (!ok) return;
    run(
      () => api(`/trip-items/${item.id}/`, { method: "DELETE" }),
      `Couldn't delete "${item.name}". Try again.`,
    );
  }

  function handleRestoreItem(item) {
    run(
      () => api(`/trip-items/${item.id}/restore/`, { method: "POST" }),
      `Couldn't restore "${item.name}". Try again.`,
    );
  }

  // Errors propagate to TripForm, which shows them.
  async function handleDuplicate(body) {
    const copy = await api(`/trips/${trip.id}/duplicate/`, {
      method: "POST",
      body,
    });
    setDuplicating(false);
    navigate(`/trips/${copy.id}`);
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
    } catch (err) {
      setActionError(
        errorMessage(err, "Couldn't delete this trip. Try again."),
      );
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
      ) : duplicating ? (
        <section className="panel" aria-labelledby="duplicate-trip-title">
          <h1 className="visually-hidden">{trip.name}</h1>
          <h2 id="duplicate-trip-title">Duplicate this trip</h2>
          <p>
            The copy starts with nothing ticked, and brings in your saved lists
            as they are now.
          </p>
          <TripForm
            initial={{
              name: trip.copy_name,
              ...sameLengthFromToday(trip.start_date, trip.end_date),
            }}
            idPrefix="duplicate-trip"
            submitLabel="Make the copy"
            onSubmit={handleDuplicate}
            onCancel={() => setDuplicating(false)}
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
            <p className="trip-hero__dates">{dates}</p>
            <p className="trip-hero__count">
              {overall.packed} / {overall.total} packed
            </p>
            <div className="trip-hero__actions">
              {overall.packed > 0 && (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => handleUntickAll()}
                >
                  Start repacking
                </button>
              )}
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setDuplicating(true)}
              >
                Duplicate trip
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

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}

      {sections.length === 0 ? (
        <p className="empty-state">
          Nothing to pack yet. Add one of your saved lists, or a new heading,
          below.
        </p>
      ) : (
        <>
          <div className="trip-view-options">
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={toggleHidePacked}
            >
              {hidePacked ? "Show packed items" : "Hide packed items"}
            </button>
          </div>
          <div className="trip-sections">
            {sections.map((section, index) => (
              <TripSection
                key={section.id}
                section={section}
                isFirst={index === 0}
                isLast={index === sections.length - 1}
                hidePacked={hidePacked}
                onToggle={handleToggle}
                onUntickAll={handleUntickAll}
                onRename={handleRename}
                onMove={handleMove}
                onRemove={handleRemove}
                onAddItem={handleAddItem}
                onSaveItem={handleSaveItem}
                onDeleteItem={handleDeleteItem}
                onRestoreItem={handleRestoreItem}
                onFollowListItem={handleFollowListItem}
                onMoveItem={handleMoveItem}
                alsoIn={(item) => otherSectionsWith(item, section)}
              />
            ))}
          </div>
        </>
      )}

      <AddSectionForm
        tripId={trip.id}
        listIdsOnTrip={sections
          .map((s) => s.saved_list)
          .filter((listId) => listId != null)}
        onAdded={reload}
      />
    </section>
  );
}
