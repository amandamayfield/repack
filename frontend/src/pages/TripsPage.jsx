import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { formatDateRange } from "../lib/dates";
import ProgressBar from "../components/ProgressBar";
import TripForm from "../components/TripForm";

export default function TripsPage() {
  const { data: trips, loading, error, reload } = useFetch("/trips/");

  return (
    <section className="page trips-page">
      <header className="page-header">
        <h1>Trips</h1>
      </header>

      <section className="panel">
        <h2>New trip</h2>
        <TripForm
          submitLabel="Add trip"
          onSubmit={async (body) => {
            await api("/trips/", { method: "POST", body });
            reload();
          }}
        />
      </section>

      {loading && <p role="status">Loading trips…</p>}
      {error && !loading && <p role="alert">Couldn't load your trips.</p>}

      {!loading && !error && trips?.length === 0 && (
        <p className="empty-state">
          No trips yet. Name your next one above to start a packing list.
        </p>
      )}

      {!loading && !error && trips?.length > 0 && (
        <ul className="trip-list">
          {trips.map((trip) => {
            const dates = formatDateRange(trip.start_date, trip.end_date);
            return (
              <li key={trip.id} className="trip-card">
                <Link to={`/trips/${trip.id}`} className="trip-card__link">
                  <h2 className="trip-card__name">{trip.name}</h2>
                  {dates && <p className="trip-card__dates">{dates}</p>}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
