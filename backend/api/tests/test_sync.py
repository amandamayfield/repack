from datetime import timedelta

import pytest
from django.utils import timezone

from api.models import TripItem, TripSection

TODAY = timezone.localdate()
LAST_MONTH = (str(TODAY - timedelta(days=40)), str(TODAY - timedelta(days=30)))
NEXT_MONTH = (str(TODAY + timedelta(days=30)), str(TODAY + timedelta(days=40)))


def _toiletries(c):
	"""A saved list: Toothbrush, then Sunscreen ×2. Returns (list, {name: list item})."""
	lst = c.post("/api/saved-lists/", {"name": "Toiletries"}, format="json").data
	items = {}
	for body in [{"name": "Toothbrush"}, {"name": "Sunscreen", "quantity": 2}]:
		item = c.post("/api/saved-list-items/", {"saved_list": lst["id"], **body}, format="json").data
		items[item["name"]] = item
	return lst, items


def _trip_with(c, lst, dates=NEXT_MONTH, name="Lisbon"):
	"""A trip holding `lst` as its only section."""
	start, end = dates
	trip = c.post("/api/trips/", {"name": name, "start_date": start, "end_date": end}, format="json").data
	section = c.post("/api/trip-sections/", {"trip": trip["id"], "saved_list": lst["id"]}, format="json").data
	return trip, section


def _items(c, trip):
	return c.get(f"/api/trips/{trip['id']}/").data["sections"][0]["items"]


def _item(c, trip, name):
	return next(i for i in _items(c, trip) if i["name"] == name)


def _shape(c, trip):
	return [(i["name"], i["quantity"], i["packed"]) for i in _items(c, trip)]


def _tick(c, item):
	c.patch(f"/api/trip-items/{item['id']}/", {"packed": True}, format="json")


# --- Item created on the list ---


@pytest.mark.django_db
def test_new_list_item_appears_on_current_trips(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	trip, section = _trip_with(c, lst)
	c.post("/api/trip-items/", {"section": section["id"], "name": "Hair ties"}, format="json")

	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")

	# Synced items keep the list's order, with trip-only extras after them.
	assert [(i["name"], i["is_synced"]) for i in _items(c, trip)] == [
		("Toothbrush", True),
		("Sunscreen", True),
		("Floss", True),
		("Hair ties", False),
	]


@pytest.mark.django_db
def test_new_list_item_skips_past_trips(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	trip, _ = _trip_with(c, lst, dates=LAST_MONTH)

	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")

	assert [i["name"] for i in _items(c, trip)] == ["Toothbrush", "Sunscreen"]


@pytest.mark.django_db
def test_end_date_today_is_current(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	trip, _ = _trip_with(c, lst, dates=(str(TODAY - timedelta(days=3)), str(TODAY)))

	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")

	assert "Floss" in [i["name"] for i in _items(c, trip)]


# --- Item changed on the list ---


@pytest.mark.django_db
def test_rename_updates_and_unticks(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	_tick(c, _item(c, trip, "Toothbrush"))

	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")

	assert _shape(c, trip)[0] == ("Electric toothbrush", None, False)


@pytest.mark.django_db
def test_quantity_change_updates_and_unticks(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	_tick(c, _item(c, trip, "Sunscreen"))

	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"quantity": 3}, format="json")

	assert _shape(c, trip)[1] == ("Sunscreen", 3, False)


@pytest.mark.django_db
@pytest.mark.parametrize("quantity", [1, None])
def test_lowering_or_clearing_quantity_keeps_the_tick(auth_client, quantity):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	_tick(c, _item(c, trip, "Sunscreen"))

	r = c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"quantity": quantity}, format="json")

	assert _shape(c, trip)[1] == ("Sunscreen", quantity, True)
	assert r.data["unticked_trips"] == []


@pytest.mark.django_db
def test_adding_an_amount_above_one_unticks(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	_tick(c, _item(c, trip, "Toothbrush"))

	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"quantity": 2}, format="json")

	assert _shape(c, trip)[0] == ("Toothbrush", 2, False)


@pytest.mark.django_db
def test_list_edit_names_the_trips_it_unticked(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	paris, _ = _trip_with(c, lst, name="Paris")
	lisbon, _ = _trip_with(c, lst, name="Lisbon")
	_trip_with(c, lst, name="Rome")  # current, but not ticked
	porto, _ = _trip_with(c, lst, name="Porto")  # ticked, then removed
	past, _ = _trip_with(c, lst, dates=LAST_MONTH, name="Berlin")
	for trip in (paris, lisbon, porto, past):
		_tick(c, _item(c, trip, "Toothbrush"))
	c.delete(f"/api/trip-items/{_item(c, porto, 'Toothbrush')['id']}/")

	r = c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")

	assert r.status_code == 200
	assert r.data["unticked_trips"] == ["Lisbon", "Paris"]


@pytest.mark.django_db
def test_unchanged_save_leaves_ticks_alone(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	_tick(c, _item(c, trip, "Sunscreen"))

	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"name": "Sunscreen", "quantity": 2}, format="json")

	assert _shape(c, trip)[1] == ("Sunscreen", 2, True)


@pytest.mark.django_db
def test_override_survives_list_quantity_change(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	sunscreen = _item(c, trip, "Sunscreen")
	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": 5}, format="json")
	_tick(c, sunscreen)

	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"quantity": 3}, format="json")

	assert _shape(c, trip)[1] == ("Sunscreen", 5, True)


@pytest.mark.django_db
def test_rename_unticks_even_with_override(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	sunscreen = _item(c, trip, "Sunscreen")
	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": 5}, format="json")
	_tick(c, sunscreen)

	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"name": "SPF 50"}, format="json")

	assert _shape(c, trip)[1] == ("SPF 50", 5, False)


@pytest.mark.django_db
def test_removed_item_not_resurrected(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	c.delete(f"/api/trip-items/{_item(c, trip, 'Toothbrush')['id']}/")

	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")

	assert [i["name"] for i in _items(c, trip)] == ["Sunscreen", "Floss"]


@pytest.mark.django_db
def test_restored_item_has_the_lists_current_values(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	sunscreen = _item(c, trip, "Sunscreen")
	c.delete(f"/api/trip-items/{sunscreen['id']}/")

	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"name": "SPF 50", "quantity": 3}, format="json")
	c.post(f"/api/trip-items/{sunscreen['id']}/restore/")

	assert _shape(c, trip)[1] == ("SPF 50", 3, False)


@pytest.mark.django_db
def test_restored_item_catches_up_when_trip_becomes_current(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst, dates=LAST_MONTH)
	toothbrush = _item(c, trip, "Toothbrush")
	c.delete(f"/api/trip-items/{toothbrush['id']}/")
	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")

	c.patch(f"/api/trips/{trip['id']}/", {"end_date": NEXT_MONTH[1]}, format="json")
	c.post(f"/api/trip-items/{toothbrush['id']}/restore/")

	assert _shape(c, trip)[0] == ("Electric toothbrush", None, False)


@pytest.mark.django_db
def test_list_item_edit_skips_past_trips(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst, dates=LAST_MONTH)
	_tick(c, _item(c, trip, "Toothbrush"))

	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")

	assert _shape(c, trip)[0] == ("Toothbrush", None, True)


# --- Item deleted from the list ---


@pytest.mark.django_db
def test_list_item_delete_removes_from_current_trips(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst)

	c.delete(f"/api/saved-list-items/{items['Toothbrush']['id']}/")

	assert [i["name"] for i in _items(c, trip)] == ["Sunscreen"]
	assert not TripItem.objects.filter(section__trip_id=trip["id"], name="Toothbrush").exists()


@pytest.mark.django_db
def test_list_item_delete_spares_past_trips(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst, dates=LAST_MONTH)
	_tick(c, _item(c, trip, "Toothbrush"))

	c.delete(f"/api/saved-list-items/{items['Toothbrush']['id']}/")

	assert _shape(c, trip)[0] == ("Toothbrush", None, True)
	kept = TripItem.objects.get(section__trip_id=trip["id"], name="Toothbrush")
	assert (kept.source_item_id, kept.from_list) == (None, True)


@pytest.mark.django_db
def test_list_items_cannot_move_between_lists(auth_client):
	c, _ = auth_client
	_, items = _toiletries(c)
	other = c.post("/api/saved-lists/", {"name": "Beach"}, format="json").data

	r = c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"saved_list": other["id"]}, format="json")

	assert r.status_code == 400
	assert "saved_list" in r.data


# --- The list itself renamed or deleted ---


@pytest.mark.django_db
def test_list_rename_keeps_past_headings(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	past, _ = _trip_with(c, lst, dates=LAST_MONTH, name="Greece")
	upcoming, _ = _trip_with(c, lst)

	c.patch(f"/api/saved-lists/{lst['id']}/", {"name": "Wash bag"}, format="json")

	assert c.get(f"/api/trips/{past['id']}/").data["sections"][0]["name"] == "Toiletries"
	assert c.get(f"/api/trips/{upcoming['id']}/").data["sections"][0]["name"] == "Wash bag"


@pytest.mark.django_db
def test_list_delete_removes_sections_from_current_trips(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	trip, section = _trip_with(c, lst)

	assert c.delete(f"/api/saved-lists/{lst['id']}/").status_code == 204

	assert c.get(f"/api/trips/{trip['id']}/").data["sections"] == []
	assert not TripItem.objects.filter(section_id=section["id"]).exists()


@pytest.mark.django_db
def test_list_delete_keeps_past_sections_as_trip_only(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	greece, _ = _trip_with(c, lst, dates=LAST_MONTH, name="Greece")
	_tick(c, _item(c, greece, "Sunscreen"))
	c.delete(f"/api/trip-items/{_item(c, greece, 'Toothbrush')['id']}/")
	crete, crete_section = _trip_with(c, lst, dates=LAST_MONTH, name="Crete")
	c.patch(f"/api/trip-sections/{crete_section['id']}/", {"name": "Crete wash bag"}, format="json")

	c.delete(f"/api/saved-lists/{lst['id']}/")

	section = c.get(f"/api/trips/{greece['id']}/").data["sections"][0]
	assert (section["name"], section["saved_list"], section["is_synced"]) == ("Toiletries", None, False)
	assert [(i["name"], i["quantity"], i["packed"], i["is_synced"]) for i in section["items"]] == [
		("Sunscreen", 2, True, False)
	]
	# The deleted Toothbrush's tombstone has nothing left to guard against.
	assert TripItem.objects.filter(section_id=section["id"]).count() == 1
	assert c.get(f"/api/trips/{crete['id']}/").data["sections"][0]["name"] == "Crete wash bag"


# --- A past trip brought back into range ---


@pytest.mark.django_db
def test_past_trip_catches_up_when_end_date_moves_forward(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	shampoo = c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shampoo"}, format="json").data
	comb = c.post(
		"/api/saved-list-items/", {"saved_list": lst["id"], "name": "Comb", "quantity": 1}, format="json"
	).data
	trip, section = _trip_with(c, lst, dates=LAST_MONTH)
	_tick(c, _item(c, trip, "Toothbrush"))
	_tick(c, _item(c, trip, "Comb"))
	c.patch(f"/api/trip-items/{_item(c, trip, 'Sunscreen')['id']}/", {"quantity": 5}, format="json")
	c.delete(f"/api/trip-items/{_item(c, trip, 'Shampoo')['id']}/")
	c.post("/api/trip-items/", {"section": section["id"], "name": "Hair ties"}, format="json")
	# While the trip is in the past, the list changes:
	c.patch(f"/api/saved-list-items/{items['Toothbrush']['id']}/", {"name": "Electric toothbrush"}, format="json")
	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"quantity": 3}, format="json")
	c.patch(f"/api/saved-list-items/{shampoo['id']}/", {"name": "Dry shampoo"}, format="json")
	c.delete(f"/api/saved-list-items/{comb['id']}/")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")

	r = c.patch(f"/api/trips/{trip['id']}/", {"end_date": NEXT_MONTH[1]}, format="json")

	assert r.status_code == 200
	assert [(i["name"], i["quantity"], i["packed"], i["is_synced"]) for i in _items(c, trip)] == [
		("Electric toothbrush", None, False, True),  # renamed on the list, so unticked
		("Sunscreen", 5, False, True),  # the trip's own amount wins
		("Floss", None, False, True),  # new on the list
		("Hair ties", None, False, False),  # the extra is untouched
	]
	# Shampoo stays deleted on this trip, and Comb is gone because the list dropped it.
	assert not TripItem.objects.filter(section_id=section["id"], name="Comb").exists()


@pytest.mark.django_db
def test_catch_up_keeps_the_tick_when_the_amount_went_down(auth_client):
	c, _ = auth_client
	lst, items = _toiletries(c)
	trip, _ = _trip_with(c, lst, dates=LAST_MONTH)
	_tick(c, _item(c, trip, "Sunscreen"))
	c.patch(f"/api/saved-list-items/{items['Sunscreen']['id']}/", {"quantity": 1}, format="json")

	c.patch(f"/api/trips/{trip['id']}/", {"end_date": NEXT_MONTH[1]}, format="json")

	assert _shape(c, trip)[1] == ("Sunscreen", 1, True)


@pytest.mark.django_db
def test_catch_up_only_when_crossing_from_past(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	past, _ = _trip_with(c, lst, dates=LAST_MONTH, name="Greece")
	current, _ = _trip_with(c, lst)
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")
	# Knock the current trip out of step by hand, so a needless catch-up would show.
	TripItem.objects.filter(section__trip_id=current["id"], name="Floss").delete()

	c.patch(f"/api/trips/{past['id']}/", {"name": "Greece 2025"}, format="json")
	c.patch(f"/api/trips/{current['id']}/", {"name": "Lisbon 2026"}, format="json")

	assert [i["name"] for i in _items(c, past)] == ["Toothbrush", "Sunscreen"]
	assert [i["name"] for i in _items(c, current)] == ["Toothbrush", "Sunscreen"]


@pytest.mark.django_db
def test_sync_only_touches_sections_of_that_list(auth_client):
	c, _ = auth_client
	lst, _ = _toiletries(c)
	trip, _ = _trip_with(c, lst)
	wedding = TripSection.objects.create(trip_id=trip["id"], custom_name="Wedding")

	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Floss"}, format="json")

	assert not wedding.items.exists()
