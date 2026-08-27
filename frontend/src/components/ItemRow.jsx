// One item row. On a trip it's a packable checkbox; on a saved-list template
// (packable=false) it's a static label, since templates have no `packed` state.
// A native checkbox wrapped in its <label> gives keyboard + screen-reader support
// for free.
export default function ItemRow({ item, packable = false, onToggle }) {
  const text = item.quantity ? `${item.name} (${item.quantity})` : item.name;

  if (!packable) {
    return <li className="item-row">{text}</li>;
  }

  return (
    <li className="item-row">
      <label className="item-row__label">
        <input
          type="checkbox"
          checked={item.packed}
          onChange={(e) => onToggle(item, e.target.checked)}
        />
        <span>{text}</span>
      </label>
    </li>
  );
}
