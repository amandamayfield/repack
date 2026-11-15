// One packable trip item. A native checkbox wrapped in its <label> gives
// keyboard + screen-reader support for free.
export default function ItemRow({ item, onToggle }) {
  const text = item.quantity ? `${item.name} (${item.quantity})` : item.name;

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
