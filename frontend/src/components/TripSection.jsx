import { useEffect, useId, useRef, useState } from "react";
import { computeProgress } from "../lib/progress";
import { readFlag, writeFlag } from "../lib/remember";
import ItemForm from "./ItemForm";
import ItemRow from "./ItemRow";

// One headed section of a trip: a synced saved list or a trip-only heading.
// The trip page owns every request; this only lays the section out.
export default function TripSection({
  section,
  isFirst,
  isLast,
  hidePacked,
  onToggle,
  onUntickAll,
  onRename,
  onMove,
  onRemove,
  onAddItem,
  onSaveItem,
  onDeleteItem,
  onRestoreItem,
  alsoIn,
}) {
  const headingId = useId();
  const bodyId = useId();
  const removedId = useId();
  const removedItems = section.removed_items ?? [];
  const storageKey = `repack.section-collapsed.${section.id}`;
  const [hidden, setHidden] = useState(() => readFlag(storageKey));
  const progress = computeProgress(section.items);
  const shownItems = hidePacked
    ? section.items.filter((item) => !item.packed)
    : section.items;
  const hiddenCount = section.items.length - shownItems.length;

  // Ticking an item while packed items are hidden unmounts its checkbox, which
  // would drop keyboard focus to <body>. Hand it to the note that says where it went.
  const noteRef = useRef(null);
  const focusNote = useRef(false);
  useEffect(() => {
    if (focusNote.current && noteRef.current) noteRef.current.focus();
    focusNote.current = false;
  });

  function toggleHidden() {
    setHidden(!hidden);
    writeFlag(storageKey, !hidden);
  }

  function handleToggle(item, packed) {
    if (hidePacked && packed) focusNote.current = true;
    onToggle(item, packed);
  }

  return (
    <section className="trip-section" aria-labelledby={headingId}>
      <header className="trip-section__header">
        <h2 id={headingId}>{section.name}</h2>
        <span className="trip-section__count">
          {progress.packed}/{progress.total} packed
        </span>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={toggleHidden}
          aria-expanded={!hidden}
          aria-controls={bodyId}
          aria-label={`${hidden ? "Show" : "Hide"} ${section.name}`}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </header>
      <div id={bodyId} className="trip-section__body" hidden={hidden}>
        <div className="trip-section__actions">
          {progress.packed > 0 && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => onUntickAll(section)}
              aria-label={`Untick all in ${section.name}`}
            >
              Untick all
            </button>
          )}
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => onRename(section)}
            aria-label={`Rename ${section.name}`}
          >
            Rename
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => onMove(section, -1)}
            disabled={isFirst}
            aria-label={`Move ${section.name} up`}
          >
            Move up
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => onMove(section, 1)}
            disabled={isLast}
            aria-label={`Move ${section.name} down`}
          >
            Move down
          </button>
          <button
            type="button"
            className="button button--ghost button--small button--quiet-danger"
            onClick={() => onRemove(section)}
            aria-label={`Remove ${section.name}`}
          >
            Remove
          </button>
        </div>

        {section.items.length === 0 ? (
          <p className="trip-section__empty">No items yet.</p>
        ) : (
          shownItems.length > 0 && (
            <ul className="item-list">
              {shownItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  lockName={item.is_synced}
                  alsoIn={alsoIn(item)}
                  onToggle={handleToggle}
                  onSave={(body) => onSaveItem(item, body)}
                  onDelete={() => onDeleteItem(item)}
                />
              ))}
            </ul>
          )
        )}
        {hiddenCount > 0 && (
          <p ref={noteRef} tabIndex={-1} className="trip-section__empty">
            {shownItems.length === 0
              ? "Everything here is packed."
              : `${hiddenCount} packed ${hiddenCount === 1 ? "item" : "items"} hidden.`}
          </p>
        )}

        {removedItems.length > 0 && (
          <>
            <p id={removedId} className="trip-section__empty">
              Removed from this trip
            </p>
            <ul className="item-list" aria-labelledby={removedId}>
              {removedItems.map((item) => (
                <li key={item.id} className="item-row">
                  <span className="item-row__label">{item.name}</span>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => onRestoreItem(item)}
                    aria-label={`Restore ${item.name}`}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <ItemForm
          onSubmit={(body) => onAddItem(section, body)}
          submitLabel="Add item"
          idPrefix={`section-${section.id}-add`}
        />
      </div>
    </section>
  );
}
