import { useState } from "react";
import ItemForm from "./ItemForm";

// One item on a trip or a saved list, with inline Edit and a Delete action.
// Pass `onToggle` (trips only) to render the packed checkbox: a native checkbox
// wrapped in its <label> gives keyboard + screen-reader support for free.
// `lockName` (synced trip items) limits the edit form to the amount.
// `alsoIn` names the trip's other sections holding the same item.
export default function ItemRow({
  item,
  lockName = false,
  alsoIn = [],
  onToggle,
  onSave,
  onDelete,
}) {
  const [editing, setEditing] = useState(false);
  // "×3" reads badly aloud, so screen readers get ", quantity 3" instead.
  const text = (
    <span>
      {item.name}
      {item.quantity && (
        <>
          <span aria-hidden="true"> ×{item.quantity}</span>
          <span className="visually-hidden">, quantity {item.quantity}</span>
        </>
      )}
      {alsoIn.length > 0 && <> (also in {alsoIn.join(", ")})</>}
    </span>
  );

  if (editing) {
    return (
      <li className="item-row item-row--editing">
        <ItemForm
          initial={item}
          lockName={lockName}
          onSubmit={async (body) => {
            await onSave(body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          idPrefix={`edit-${item.id}`}
        />
      </li>
    );
  }

  return (
    <li className={item.packed ? "item-row item-row--packed" : "item-row"}>
      {onToggle ? (
        <label className="item-row__label">
          <input
            type="checkbox"
            className="item-row__check"
            checked={item.packed}
            onChange={(e) => onToggle(item, e.target.checked)}
          />
          {text}
        </label>
      ) : (
        <span className="item-row__label">{text}</span>
      )}
      <div className="item-row__actions">
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${item.name}`}
        >
          Edit
        </button>
        <button
          type="button"
          className="button button--ghost button--small button--quiet-danger"
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
