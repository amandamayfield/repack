import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from api.models import TripItem
from api.tests.dates import UPCOMING


def _trip_with_synced_section(c):
	"""A trip holding the 'Toiletries' list: Toothbrush, and Sunscreen ×2."""
	trip = c.post("/api/trips/", {"name": "Lisbon", **UPCOMING}, format="json").data
	lst = c.post("/api/saved-lists/", {"name": "Toiletries"}, format="json").data
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Toothbrush"}, format="json")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sunscreen", "quantity": 2}, format="json")
	section = c.post("/api/trip-sections/", {"trip": trip["id"], "saved_list": lst["id"]}, format="json").data
	return trip, section


def _items(c, trip):
	return c.get(f"/api/trips/{trip['id']}/").data["sections"][0]["items"]


@pytest.mark.django_db
def test_add_extra_to_synced_section_goes_last(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)

	r = c.post("/api/trip-items/", {"section": section["id"], "name": "Hair ties", "quantity": 3}, format="json")

	assert r.status_code == 201
	assert (r.data["name"], r.data["quantity"], r.data["is_synced"], r.data["packed"]) == ("Hair ties", 3, False, False)
	assert [i["name"] for i in _items(c, trip)] == ["Toothbrush", "Sunscreen", "Hair ties"]


@pytest.mark.django_db
def test_add_item_to_trip_only_section(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Lisbon", **UPCOMING}, format="json").data
	section = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json").data

	r = c.post("/api/trip-items/", {"section": section["id"], "name": "Suit"}, format="json")

	assert r.status_code == 201
	assert r.data["is_synced"] is False


@pytest.mark.django_db
def test_client_cannot_mark_an_extra_as_synced(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)

	r = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat", "is_synced": True}, format="json")

	assert TripItem.objects.get(id=r.data["id"]).from_list is False


@pytest.mark.django_db
def test_tick_synced_item(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]

	r = c.patch(f"/api/trip-items/{toothbrush['id']}/", {"packed": True}, format="json")

	assert r.status_code == 200 and r.data["packed"] is True


@pytest.mark.django_db
def test_changing_synced_amount_marks_override(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	sunscreen = section["items"][1]

	r = c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": 5}, format="json")

	assert r.status_code == 200 and r.data["quantity"] == 5
	assert TripItem.objects.get(id=sunscreen["id"]).quantity_overridden is True


@pytest.mark.django_db
def test_clearing_synced_amount_marks_override(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	sunscreen = section["items"][1]

	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": None}, format="json")

	item = TripItem.objects.get(id=sunscreen["id"])
	assert (item.quantity, item.quantity_overridden) == (None, True)


@pytest.mark.django_db
def test_resending_unchanged_amount_is_not_an_override(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	sunscreen = section["items"][1]

	r = c.patch(f"/api/trip-items/{sunscreen['id']}/", {"name": "Sunscreen", "quantity": 2}, format="json")

	assert r.status_code == 200
	assert TripItem.objects.get(id=sunscreen["id"]).quantity_overridden is False


def _list_item_url(trip_item):
	return f"/api/saved-list-items/{TripItem.objects.get(id=trip_item['id']).source_item_id}/"


@pytest.mark.django_db
def test_items_say_whether_they_follow_the_lists_amount(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	extra = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat"}, format="json").data
	c.patch(f"/api/trip-items/{section['items'][1]['id']}/", {"quantity": 5}, format="json")

	items = _items(c, trip)

	assert [(i["name"], i["can_follow_list"], i["list_quantity"]) for i in items] == [
		("Toothbrush", False, None),
		("Sunscreen", True, 2),
		("Hat", False, None),
	]
	assert extra["list_quantity"] is None


@pytest.mark.django_db
def test_trip_detail_queries_dont_grow_with_items(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	with CaptureQueriesContext(connection) as before:
		c.get(f"/api/trips/{trip['id']}/")
	list_id = TripItem.objects.get(id=section["items"][0]["id"]).source_item.saved_list_id
	for name in ["Floss", "Comb", "Razor"]:
		c.post("/api/saved-list-items/", {"saved_list": list_id, "name": name}, format="json")

	with CaptureQueriesContext(connection) as after:
		c.get(f"/api/trips/{trip['id']}/")

	assert len(after) == len(before)


@pytest.mark.django_db
def test_typing_the_lists_amount_back_follows_the_list_again(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	sunscreen = section["items"][1]
	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": 5}, format="json")

	r = c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": 2}, format="json")
	c.patch(_list_item_url(sunscreen), {"quantity": 3}, format="json")

	assert r.data["can_follow_list"] is False
	assert _items(c, trip)[1]["quantity"] == 3


@pytest.mark.django_db
@pytest.mark.parametrize(("own", "packed"), [(5, True), (1, False)])
def test_follow_list_takes_the_lists_amount_and_unticks_only_if_it_went_up(auth_client, own, packed):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	sunscreen = section["items"][1]
	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"quantity": own, "packed": True}, format="json")

	r = c.post(f"/api/trip-items/{sunscreen['id']}/follow-list/")

	assert r.status_code == 200
	assert (r.data["quantity"], r.data["packed"], r.data["can_follow_list"]) == (2, packed, False)
	c.patch(_list_item_url(sunscreen), {"quantity": 3}, format="json")
	assert _items(c, trip)[1]["quantity"] == 3


@pytest.mark.django_db
def test_follow_list_can_clear_the_amount(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]
	c.patch(f"/api/trip-items/{toothbrush['id']}/", {"quantity": 2}, format="json")

	r = c.post(f"/api/trip-items/{toothbrush['id']}/follow-list/")

	assert (r.data["quantity"], r.data["can_follow_list"]) == (None, False)


@pytest.mark.django_db
def test_follow_list_needs_an_item_from_a_list(auth_client, other_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	extra = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat", "quantity": 2}, format="json").data

	r = c.post(f"/api/trip-items/{extra['id']}/follow-list/")

	assert r.status_code == 400
	assert TripItem.objects.get(id=extra["id"]).quantity == 2
	assert other_client.post(f"/api/trip-items/{section['items'][1]['id']}/follow-list/").status_code == 404


@pytest.mark.django_db
def test_changing_extra_amount_is_not_an_override(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	extra = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat"}, format="json").data

	c.patch(f"/api/trip-items/{extra['id']}/", {"quantity": 2}, format="json")

	item = TripItem.objects.get(id=extra["id"])
	assert (item.quantity, item.quantity_overridden) == (2, False)


@pytest.mark.django_db
def test_synced_item_cannot_be_renamed(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]

	r = c.patch(f"/api/trip-items/{toothbrush['id']}/", {"name": "Electric toothbrush"}, format="json")

	assert r.status_code == 400
	assert r.data == {"name": ["Rename this item on its saved list."]}
	assert TripItem.objects.get(id=toothbrush["id"]).name == "Toothbrush"


@pytest.mark.django_db
def test_extra_can_be_renamed(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	extra = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat"}, format="json").data

	r = c.patch(f"/api/trip-items/{extra['id']}/", {"name": "Sun hat"}, format="json")

	assert r.status_code == 200 and r.data["name"] == "Sun hat"


@pytest.mark.django_db
def test_items_cannot_move_between_sections(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	wedding = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json").data
	extra = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat"}, format="json").data

	r = c.patch(f"/api/trip-items/{extra['id']}/", {"section": wedding["id"]}, format="json")

	assert r.status_code == 400
	assert TripItem.objects.get(id=extra["id"]).section_id == section["id"]


@pytest.mark.django_db
def test_deleting_synced_item_marks_it_removed(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]

	r = c.delete(f"/api/trip-items/{toothbrush['id']}/")

	assert r.status_code == 204
	assert TripItem.objects.get(id=toothbrush["id"]).removed is True
	assert [i["name"] for i in _items(c, trip)] == ["Sunscreen"]


@pytest.mark.django_db
def test_deleting_extra_deletes_the_row(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	extra = c.post("/api/trip-items/", {"section": section["id"], "name": "Hat"}, format="json").data

	assert c.delete(f"/api/trip-items/{extra['id']}/").status_code == 204

	assert not TripItem.objects.filter(id=extra["id"]).exists()


@pytest.mark.django_db
def test_removed_items_are_hidden_from_the_items_api(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]
	c.delete(f"/api/trip-items/{toothbrush['id']}/")

	assert [i["name"] for i in c.get("/api/trip-items/").data] == ["Sunscreen"]
	assert c.get(f"/api/trip-items/{toothbrush['id']}/").status_code == 404
	assert c.patch(f"/api/trip-items/{toothbrush['id']}/", {"packed": True}, format="json").status_code == 404
	assert c.delete(f"/api/trip-items/{toothbrush['id']}/").status_code == 404


@pytest.mark.django_db
def test_trip_items_belong_to_their_owner(auth_client, other_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]

	assert other_client.get(f"/api/trip-items/{toothbrush['id']}/").status_code == 404
	assert (
		other_client.patch(f"/api/trip-items/{toothbrush['id']}/", {"packed": True}, format="json").status_code == 404
	)
	assert other_client.delete(f"/api/trip-items/{toothbrush['id']}/").status_code == 404
	r = other_client.post("/api/trip-items/", {"section": section["id"], "name": "Sneaky"}, format="json")
	assert r.status_code == 400


@pytest.mark.django_db
def test_section_lists_its_removed_items(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]
	c.delete(f"/api/trip-items/{toothbrush['id']}/")

	shown = c.get(f"/api/trips/{trip['id']}/").data["sections"][0]

	assert shown["removed_items"] == [{"id": toothbrush["id"], "name": "Toothbrush"}]


@pytest.mark.django_db
def test_restore_brings_a_removed_item_back_in_place_unticked(auth_client):
	c, _ = auth_client
	trip, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]
	c.patch(f"/api/trip-items/{toothbrush['id']}/", {"packed": True}, format="json")
	c.delete(f"/api/trip-items/{toothbrush['id']}/")

	r = c.post(f"/api/trip-items/{toothbrush['id']}/restore/")

	assert r.status_code == 200
	assert (r.data["name"], r.data["packed"]) == ("Toothbrush", False)
	shown = c.get(f"/api/trips/{trip['id']}/").data["sections"][0]
	assert [i["name"] for i in shown["items"]] == ["Toothbrush", "Sunscreen"]
	assert shown["removed_items"] == []


@pytest.mark.django_db
def test_restoring_a_live_item_changes_nothing(auth_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]
	c.patch(f"/api/trip-items/{toothbrush['id']}/", {"packed": True}, format="json")

	r = c.post(f"/api/trip-items/{toothbrush['id']}/restore/")

	assert r.status_code == 200
	assert r.data["packed"] is True


@pytest.mark.django_db
def test_cant_restore_another_users_item(auth_client, other_client):
	c, _ = auth_client
	_, section = _trip_with_synced_section(c)
	toothbrush = section["items"][0]
	c.delete(f"/api/trip-items/{toothbrush['id']}/")

	assert other_client.post(f"/api/trip-items/{toothbrush['id']}/restore/").status_code == 404
	assert TripItem.objects.get(id=toothbrush["id"]).removed is True
