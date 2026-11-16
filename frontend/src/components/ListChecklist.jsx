// Tick any number of saved lists. `selected` holds list ids, kept in the order
// the lists are shown, so sections are added in that order too.
export default function ListChecklist({
  legend,
  lists,
  selected,
  onChange,
  disabled,
}) {
  function toggle(id) {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    onChange(lists.map((l) => l.id).filter((l) => next.includes(l)));
  }

  return (
    <fieldset className="list-checklist" disabled={disabled}>
      <legend>{legend}</legend>
      {lists.map((list) => (
        <label key={list.id} className="list-checklist__option">
          <input
            type="checkbox"
            checked={selected.includes(list.id)}
            onChange={() => toggle(list.id)}
          />
          <span>{list.name}</span>
        </label>
      ))}
    </fieldset>
  );
}
