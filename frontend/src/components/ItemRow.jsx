import { useState } from "react";
import ItemForm from "./ItemForm";

// One item on a trip or a saved list, with inline Edit and a Delete action.
// Pass `onToggle` (trips only) to render the packed checkbox: a native checkbox
// wrapped in its <label> gives keyboard + screen-reader support for free.
export default function ItemRow({
  item,
  categories,
  onToggle,
  onSave,
  onDelete,
}) {
  const [editing, setEditing] = useState(false);
  const text = item.quantity ? `${item.name} (${item.quantity})` : item.name;

  if (editing) {
    return (
      <li className="item-row item-row--editing">
        <ItemForm
          initial={item}
          categories={categories}
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
          <span>{text}</span>
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
