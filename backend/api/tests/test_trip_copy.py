from datetime import timedelta

import pytest
from django.utils import timezone

from api.serializers import TripDetailSerializer
from api.tests.dates import UPCOMING

TODAY = timezone.localdate()


@pytest.mark.django_db
def test_duplicate_without_a_name_numbers_copy_of(auth_client, other_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Chicago", **UPCOMING}, format="json").data
	other_client.post(
		"/api/trips/", {"name": "Copy of Chicago (2)", **UPCOMING}, format="json"
	)  # someone else's: no clash
	url = f"/api/trips/{trip['id']}/duplicate/"

	names = [c.post(url, UPCOMING, format="json").data["name"] for _ in range(3)]

	assert names == ["Copy of Chicago", "Copy of Chicago (2)", "Copy of Chicago (3)"]


@pytest.mark.django_db
def test_copy_name_is_offered_on_the_trip_and_fits(auth_client):
	c, _ = auth_client
	chicago = c.post("/api/trips/", {"name": "Chicago", **UPCOMING}, format="json").data
	c.post(f"/api/trips/{chicago['id']}/duplicate/", UPCOMING, format="json")
	long = c.post("/api/trips/", {"name": "x" * 150, **UPCOMING}, format="json").data
	c.post(f"/api/trips/{long['id']}/duplicate/", UPCOMING, format="json")

	assert c.get(f"/api/trips/{chicago['id']}/").data["copy_name"] == "Copy of Chicago (2)"
	second = c.get(f"/api/trips/{long['id']}/").data["copy_name"]
	assert len(second) == 150
	assert second.startswith("Copy of x") and second.endswith(" (2)")


@pytest.mark.django_db
def test_duplicate_cannot_reuse_a_trip_name(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Chicago", **UPCOMING}, format="json").data
	c.post("/api/trips/", {"name": "Porto", **UPCOMING}, format="json")
	url = f"/api/trips/{trip['id']}/duplicate/"

	for taken in ["Chicago", "porto"]:
		assert c.post(url, {"name": taken, **UPCOMING}, format="json").status_code == 400, taken

	assert len(c.get("/api/trips/").data) == 2


@pytest.mark.django_db
def test_duplicate_takes_a_name_and_dates(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Chicago", **UPCOMING}, format="json").data
	body = {"name": "Chicago, March", "start_date": "2027-03-02", "end_date": "2027-03-04"}

	r = c.post(f"/api/trips/{trip['id']}/duplicate/", body, format="json")

	assert r.status_code == 201
	assert (r.data["name"], r.data["start_date"], r.data["end_date"]) == ("Chicago, March", "2027-03-02", "2027-03-04")


@pytest.mark.django_db
def test_duplicate_with_bad_details_makes_no_copy(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Chicago", **UPCOMING}, format="json").data
	url = f"/api/trips/{trip['id']}/duplicate/"

	for bad in [
		{**UPCOMING, "name": ""},
		{**UPCOMING, "name": "x" * 151},
		{"start_date": "2027-03-04", "end_date": "2027-03-02"},
	]:
		assert c.post(url, bad, format="json").status_code == 400, bad

	assert len(c.get("/api/trips/").data) == 1


@pytest.mark.django_db
def test_duplicate_needs_both_dates(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Chicago", **UPCOMING, **UPCOMING}, format="json").data

	r = c.post(f"/api/trips/{trip['id']}/duplicate/", {"name": "Chicago, March"}, format="json")

	assert r.status_code == 400
	assert set(r.data) == {"start_date", "end_date"}
	assert len(c.get("/api/trips/").data) == 1


@pytest.mark.django_db
def test_duplicate_others_trip_404(auth_client, other_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Lisbon", **UPCOMING}, format="json").data
	r = other_client.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json")
	assert r.status_code == 404
	assert len(c.get("/api/trips/").data) == 1


def _seed(c, dates=(UPCOMING["start_date"], UPCOMING["end_date"])):
	"""Lisbon: a 'Toiletries' section (Toothbrush; Sunscreen ×2, the trip says ×5, ticked; Floss, deleted on
	the trip; Hair ties, an extra), then a trip-only 'Wedding' section (Suit, ticked)."""
	lst = c.post("/api/saved-lists/", {"name": "Toiletries"}, format="json").data
	for body in [{"name": "Toothbrush"}, {"name": "Sunscreen", "quantity": 2}, {"name": "Floss"}]:
		c.post("/api/saved-list-items/", {"saved_list": lst["id"], **body}, format="json")
	start, end = dates
	trip = c.post("/api/trips/", {"name": "Lisbon", "start_date": start, "end_date": end}, format="json").data
	toiletries = c.post("/api/trip-sections/", {"trip": trip["id"], "saved_list": lst["id"]}, format="json").data
	_, sunscreen, floss = toiletries["items"]
	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": 5, "packed": True}, format="json")
	c.delete(f"/api/trip-items/{floss['id']}/")
	c.post("/api/trip-items/", {"section": toiletries["id"], "name": "Hair ties"}, format="json")
	wedding = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json").data
	suit = c.post("/api/trip-items/", {"section": wedding["id"], "name": "Suit"}, format="json").data
	c.patch(f"/api/trip-items/{suit['id']}/", {"packed": True}, format="json")
	return trip, lst


def _sections(data):
	return [
		(s["name"], s["saved_list"], [(i["name"], i["quantity"], i["is_synced"]) for i in s["items"]])
		for s in data["sections"]
	]


@pytest.mark.django_db
def test_duplicate_copies_sections_overrides_and_extras(auth_client):
	c, _ = auth_client
	trip, lst = _seed(c)

	r = c.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json")

	assert r.status_code == 201
	assert (r.data["name"], r.data["start_date"], r.data["end_date"]) == (
		"Copy of Lisbon",
		UPCOMING["start_date"],
		UPCOMING["end_date"],
	)
	assert _sections(r.data) == [
		(
			"Toiletries",
			lst["id"],
			[("Toothbrush", None, True), ("Sunscreen", 5, True), ("Hair ties", None, False)],
		),
		("Wedding", None, [("Suit", None, False)]),
	]


@pytest.mark.django_db
def test_duplicate_all_unticked(auth_client):
	c, _ = auth_client
	trip, _ = _seed(c)

	copy = c.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json").data

	assert all(not i["packed"] for s in copy["sections"] for i in s["items"])
	original = c.get(f"/api/trips/{trip['id']}/").data
	assert sum(i["packed"] for s in original["sections"] for i in s["items"]) == 2


@pytest.mark.django_db
def test_duplicate_keeps_sections_synced(auth_client):
	c, _ = auth_client
	trip, lst = _seed(c)
	copy = c.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json").data
	floss = next(i for i in c.get(f"/api/saved-lists/{lst['id']}/").data["items"] if i["name"] == "Floss")

	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Comb"}, format="json")
	c.patch(f"/api/saved-list-items/{floss['id']}/", {"name": "Dental floss"}, format="json")

	names = [i["name"] for i in c.get(f"/api/trips/{copy['id']}/").data["sections"][0]["items"]]
	# Comb arrives; Floss, deleted on the original, stays deleted on the copy.
	assert names == ["Toothbrush", "Sunscreen", "Comb", "Hair ties"]


@pytest.mark.django_db
def test_duplicate_keeps_renamed_section_name(auth_client):
	c, _ = auth_client
	trip, _ = _seed(c)
	section = c.get(f"/api/trips/{trip['id']}/").data["sections"][0]
	c.patch(f"/api/trip-sections/{section['id']}/", {"name": "Lisbon wash bag"}, format="json")

	copy = c.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json").data

	assert copy["sections"][0]["name"] == "Lisbon wash bag"
	assert copy["sections"][0]["is_synced"] is True


@pytest.mark.django_db
def test_duplicate_of_past_trip_uses_current_list(auth_client):
	c, _ = auth_client
	trip, lst = _seed(c, dates=(str(TODAY - timedelta(days=40)), str(TODAY - timedelta(days=30))))
	items = {i["name"]: i for i in c.get(f"/api/saved-lists/{lst['id']}/").data["items"]}
	# While the trip is in the past, the list changes; the trip doesn't.
	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")
	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"quantity": 3}, format="json")
	c.delete(f"/api/saved-list-items/{items['Floss']['id']}/")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Comb"}, format="json")

	copy = c.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json").data

	assert _sections(copy)[0][2] == [
		("Electric toothbrush", None, True),
		("Sunscreen", 5, True),  # the trip's own amount still wins
		("Comb", None, True),
		("Hair ties", None, False),
	]


@pytest.mark.django_db
def test_duplicate_of_past_trip_drops_items_gone_from_the_list(auth_client):
	c, _ = auth_client
	trip, lst = _seed(c, dates=(str(TODAY - timedelta(days=40)), str(TODAY - timedelta(days=30))))
	toothbrush = next(i for i in c.get(f"/api/saved-lists/{lst['id']}/").data["items"] if i["name"] == "Toothbrush")
	c.delete(f"/api/saved-list-items/{toothbrush['id']}/")

	copy = c.post(f"/api/trips/{trip['id']}/duplicate/", UPCOMING, format="json").data

	assert [i["name"] for i in copy["sections"][0]["items"]] == ["Sunscreen", "Hair ties"]


@pytest.mark.django_db
def test_duplicating_into_a_name_that_loses_the_race_400(auth_client, monkeypatch):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Chicago", **UPCOMING}, format="json").data
	c.post("/api/trips/", {"name": "Porto", **UPCOMING}, format="json")
	# The name check passes, as it does when another request saves the same name a moment later.
	monkeypatch.setattr(TripDetailSerializer, "validate_name", lambda self, value: value)

	r = c.post(f"/api/trips/{trip['id']}/duplicate/", {"name": "Porto", **UPCOMING}, format="json")

	assert r.status_code == 400
	assert r.data == {"name": ['You already have a trip called "Porto". Trip names can\'t match, so pick another.']}
	assert len(c.get("/api/trips/").data) == 2
