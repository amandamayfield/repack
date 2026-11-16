import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction

from api.models import Trip, TripSection
from api.serializers import TripDetailSerializer


def _section(trip):
	"""A trip-only section made directly in the database; these tests aren't about sections."""
	return TripSection.objects.create(trip_id=trip["id"], custom_name="Beach").id


@pytest.mark.django_db
def test_create_trip_and_toggle_packed(auth_client):
	c, _ = auth_client
	trip = c.post(
		"/api/trips/", {"name": "Beach", "start_date": "2026-07-01", "end_date": "2026-07-03"}, format="json"
	).data
	item = c.post("/api/trip-items/", {"section": _section(trip), "name": "Towel", "order": 0}, format="json").data
	assert item["packed"] is False
	r = c.patch(f"/api/trip-items/{item['id']}/", {"packed": True}, format="json")
	assert r.status_code == 200 and r.data["packed"] is True


@pytest.mark.django_db
def test_trip_list_includes_progress_counts(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach"}, format="json").data
	section = _section(trip)
	i1 = c.post("/api/trip-items/", {"section": section, "name": "A", "order": 0}, format="json").data
	c.post("/api/trip-items/", {"section": section, "name": "B", "order": 1}, format="json")
	c.patch(f"/api/trip-items/{i1['id']}/", {"packed": True}, format="json")

	row = c.get("/api/trips/").data[0]
	assert row["total_count"] == 2
	assert row["packed_count"] == 1


@pytest.mark.django_db
def test_trip_isolation(auth_client, other_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach"}, format="json").data
	adam = other_client
	assert adam.get(f"/api/trips/{trip['id']}/").status_code == 404


@pytest.mark.django_db
def test_trip_end_date_cannot_precede_start(auth_client):
	c, _ = auth_client
	r = c.post("/api/trips/", {"name": "Beach", "start_date": "2026-07-10", "end_date": "2026-07-01"}, format="json")
	assert r.status_code == 400
	assert "end_date" in r.data
	# A PATCH that sends only one date is checked against the stored other one.
	trip = c.post("/api/trips/", {"name": "Beach", "start_date": "2026-07-10"}, format="json").data
	r = c.patch(f"/api/trips/{trip['id']}/", {"end_date": "2026-07-01"}, format="json")
	assert r.status_code == 400
	r = c.patch(f"/api/trips/{trip['id']}/", {"end_date": "2026-07-12"}, format="json")
	assert r.status_code == 200


@pytest.mark.django_db
def test_trip_dates_round_trip_and_days_is_gone(auth_client):
	c, _ = auth_client
	c.post("/api/trips/", {"name": "Beach", "start_date": "2026-07-01", "end_date": "2026-07-03"}, format="json")
	row = c.get("/api/trips/").data[0]
	assert (row["start_date"], row["end_date"]) == ("2026-07-01", "2026-07-03")
	assert "days" not in row


@pytest.mark.django_db
def test_cannot_touch_others_trip_items_or_move_items_onto_their_section(auth_client, other_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach"}, format="json").data
	item = c.post("/api/trip-items/", {"section": _section(trip), "name": "Towel"}, format="json").data
	adam_trip = other_client.post("/api/trips/", {"name": "Adam"}, format="json").data
	adam_section = _section(adam_trip)
	assert other_client.patch(f"/api/trip-items/{item['id']}/", {"packed": True}, format="json").status_code == 404
	assert other_client.delete(f"/api/trip-items/{item['id']}/").status_code == 404
	r = c.patch(f"/api/trip-items/{item['id']}/", {"section": adam_section}, format="json")
	assert r.status_code == 400


@pytest.mark.django_db
def test_delete_own_trip_removes_its_items(auth_client, other_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach"}, format="json").data
	c.post("/api/trip-items/", {"section": _section(trip), "name": "Towel"}, format="json")
	assert other_client.delete(f"/api/trips/{trip['id']}/").status_code == 404
	assert c.delete(f"/api/trips/{trip['id']}/").status_code == 204
	assert c.get("/api/trip-items/").data == []


@pytest.mark.django_db
def test_trip_names_must_be_unique_for_you(auth_client, other_client):
	c, _ = auth_client
	c.post("/api/trips/", {"name": "Chicago"}, format="json")
	other_client.post("/api/trips/", {"name": "Lisbon"}, format="json")

	r = c.post("/api/trips/", {"name": "  chicago "}, format="json")

	assert r.status_code == 400
	assert r.data == {"name": ['You already have a trip called "chicago". Trip names can\'t match, so pick another.']}
	assert c.post("/api/trips/", {"name": "Lisbon"}, format="json").status_code == 201
	assert len(c.get("/api/trips/").data) == 2


@pytest.mark.django_db
def test_renaming_a_trip_to_another_trips_name_400(auth_client):
	c, _ = auth_client
	c.post("/api/trips/", {"name": "Chicago"}, format="json")
	porto = c.post("/api/trips/", {"name": "Porto"}, format="json").data

	assert c.patch(f"/api/trips/{porto['id']}/", {"name": "CHICAGO"}, format="json").status_code == 400
	# Saving a trip under its own name isn't a clash.
	assert c.patch(f"/api/trips/{porto['id']}/", {"name": "Porto", "end_date": None}, format="json").status_code == 200


@pytest.fixture
def lost_race(monkeypatch):
	"""The name check passes, as it does when another request saves the same name a moment later."""
	monkeypatch.setattr(TripDetailSerializer, "validate_name", lambda self, value: value)


@pytest.mark.django_db
def test_the_database_refuses_two_trips_with_the_same_name(auth_client):
	_, user = auth_client
	Trip.objects.create(user=user, name="Chicago")
	Trip.objects.create(user=User.objects.create_user(username="sam"), name="Chicago")

	with pytest.raises(IntegrityError), transaction.atomic():
		Trip.objects.create(user=user, name="CHICAGO")


@pytest.mark.django_db
def test_creating_a_trip_that_loses_the_name_race_400(auth_client, lost_race):
	c, _ = auth_client
	c.post("/api/trips/", {"name": "Chicago"}, format="json")

	r = c.post("/api/trips/", {"name": "chicago"}, format="json")

	assert r.status_code == 400
	assert r.data == {"name": ['You already have a trip called "chicago". Trip names can\'t match, so pick another.']}
	assert len(c.get("/api/trips/").data) == 1


@pytest.mark.django_db
def test_renaming_a_trip_that_loses_the_name_race_400(auth_client, lost_race):
	c, _ = auth_client
	c.post("/api/trips/", {"name": "Chicago"}, format="json")
	porto = c.post("/api/trips/", {"name": "Porto"}, format="json").data

	r = c.patch(f"/api/trips/{porto['id']}/", {"name": "Chicago"}, format="json")

	assert r.status_code == 400
	assert r.data == {"name": ['You already have a trip called "Chicago". Trip names can\'t match, so pick another.']}
	assert c.get(f"/api/trips/{porto['id']}/").data["name"] == "Porto"
