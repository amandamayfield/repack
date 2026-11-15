import { useId, useState } from "react";
import { computeProgress } from "../lib/progress";
import ItemForm from "./ItemForm";
import ItemRow from "./ItemRow";

// Whether a section is hidden is remembered per browser. Storage can be blocked
// (some private windows); hiding then still works, it just isn't remembered.
function readHidden(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeHidden(key, hidden) {
  try {
    if (hidden) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // Not remembered; see readHidden.
  }
}

// One headed section of a trip: a synced saved list or a trip-only heading.
// The trip page owns every request; this only lays the section out.
export default function TripSection({
  section,
  isFirst,
  isLast,
  onToggle,
  onRename,
  onMove,
  onRemove,
  onAddItem,
  onSaveItem,
  onDeleteItem,
}) {
  const headingId = useId();
  const bodyId = useId();
  const storageKey = `repack.section-collapsed.${section.id}`;
  const [hidden, setHidden] = useState(() => readHidden(storageKey));
  const progress = computeProgress(section.items);

  function toggleHidden() {
    setHidden(!hidden);
    writeHidden(storageKey, !hidden);
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
          <ul className="item-list">
            {section.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                lockName={item.is_synced}
                onToggle={onToggle}
                onSave={(body) => onSaveItem(item, body)}
                onDelete={() => onDeleteItem(item)}
              />
            ))}
          </ul>
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
