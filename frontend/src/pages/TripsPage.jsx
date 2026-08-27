import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/authContext";
import { useFetch } from "../hooks/useFetch";
import ProgressBar from "../components/ProgressBar";

export default function TripsPage() {
  const { handle403 } = useAuth();
  const { data: trips, loading, error, reload } = useFetch("/trips/");
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setFormError(null);
    try {
      const body = { name: trimmed };
      if (days !== "") body.days = Number(days);
      await api("/trips/", { method: "POST", body });
      setName("");
      setDays("");
      reload();
    } catch (err) {
      if (!handle403(err)) setFormError("Could not create the trip. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="page trips-page">
      <h1>Trips</h1>

      <form onSubmit={handleCreate} className="create-form">
        <label htmlFor="trip-name">Trip name</label>
        <input
          id="trip-name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />

        <label htmlFor="trip-days">Days (optional)</label>
        <input
          id="trip-days"
          name="days"
          type="number"
          min="1"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          disabled={pending}
        />

        <button type="submit" disabled={pending || name.trim() === ""}>
          {pending ? "Creating…" : "Add trip"}
        </button>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
      </form>

      {loading && <p role="status">Loading trips…</p>}
      {error && !loading && <p role="alert">Could not load your trips.</p>}

      {!loading && !error && trips?.length === 0 && (
        <p className="empty-state">No trips yet. Create one above to get started.</p>
      )}

      {!loading && !error && trips?.length > 0 && (
        <ul className="trip-list">
          {trips.map((trip) => (
            <li key={trip.id} className="trip-card">
              <Link to={`/trips/${trip.id}`} className="trip-card__link">
                <h2 className="trip-card__name">{trip.name}</h2>
                <ProgressBar
                  value={trip.packed_count}
                  max={trip.total_count}
                  label={`${trip.name} packing progress`}
                />
                <p className="trip-card__count">
                  {trip.packed_count} / {trip.total_count} packed
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
