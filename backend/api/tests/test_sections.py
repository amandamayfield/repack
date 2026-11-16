import pytest

from api.models import TripItem


def _list_with_items(c, name="Camping"):
	lst = c.post("/api/saved-lists/", {"name": name}, format="json").data
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shirts", "quantity": 4}, format="json")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sunscreen"}, format="json")
	return lst


def _trip(c, name="Lisbon"):
	return c.post("/api/trips/", {"name": name}, format="json").data


def _add_list(c, trip, lst):
	return c.post("/api/trip-sections/", {"trip": trip["id"], "saved_list": lst["id"]}, format="json")


@pytest.mark.django_db
def test_add_list_copies_items_in_order_unticked(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)

	r = _add_list(c, trip, lst)

	assert r.status_code == 201
	assert (r.data["name"], r.data["saved_list"], r.data["is_synced"]) == ("Camping", lst["id"], True)
	items = r.data["items"]
	assert [(i["name"], i["quantity"]) for i in items] == [("Shirts", 4), ("Sunscreen", None)]
	assert all(i["packed"] is False and i["is_synced"] is True for i in items)


@pytest.mark.django_db
def test_trip_detail_embeds_sections_with_items(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	_add_list(c, trip, lst)

	detail = c.get(f"/api/trips/{trip['id']}/").data

	assert [s["name"] for s in detail["sections"]] == ["Camping"]
	assert [i["name"] for i in detail["sections"][0]["items"]] == ["Shirts", "Sunscreen"]


@pytest.mark.django_db
def test_add_trip_only_section(auth_client):
	c, _ = auth_client
	trip = _trip(c)

	r = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json")

	assert r.status_code == 201
	assert (r.data["name"], r.data["saved_list"], r.data["is_synced"], r.data["items"]) == ("Wedding", None, False, [])


@pytest.mark.django_db
def test_trip_only_section_needs_a_name(auth_client):
	c, _ = auth_client
	trip = _trip(c)

	r = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "  "}, format="json")

	assert r.status_code == 400
	assert "name" in r.data


@pytest.mark.django_db
def test_add_same_list_twice_400(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	_add_list(c, trip, lst)

	r = _add_list(c, trip, lst)

	assert r.status_code == 400
	assert r.data == {"saved_list": ["This list is already on this trip."]}
	assert len(c.get(f"/api/trips/{trip['id']}/").data["sections"]) == 1


@pytest.mark.django_db
def test_same_list_can_go_on_different_trips(auth_client):
	c, _ = auth_client
	lst = _list_with_items(c)
	assert _add_list(c, _trip(c, "A"), lst).status_code == 201
	assert _add_list(c, _trip(c, "B"), lst).status_code == 201


@pytest.mark.django_db
def test_new_sections_go_last(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	for name in ["A", "B", "C"]:
		c.post("/api/trip-sections/", {"trip": trip["id"], "name": name, "order": 0}, format="json")

	sections = c.get(f"/api/trips/{trip['id']}/").data["sections"]

	assert [s["name"] for s in sections] == ["A", "B", "C"]
	assert [s["order"] for s in sections] == [0, 1, 2]


@pytest.mark.django_db
def test_rename_synced_section_is_trip_only(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	section = _add_list(c, trip, lst).data

	r = c.patch(f"/api/trip-sections/{section['id']}/", {"name": "Lisbon camping"}, format="json")

	assert r.status_code == 200
	assert (r.data["name"], r.data["is_synced"]) == ("Lisbon camping", True)
	assert c.get(f"/api/saved-lists/{lst['id']}/").data["name"] == "Camping"


@pytest.mark.django_db
def test_clearing_synced_section_name_restores_list_name(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	section = _add_list(c, trip, lst).data
	c.patch(f"/api/trip-sections/{section['id']}/", {"name": "Lisbon camping"}, format="json")

	r = c.patch(f"/api/trip-sections/{section['id']}/", {"name": ""}, format="json")

	assert r.status_code == 200
	assert r.data["name"] == "Camping"


@pytest.mark.django_db
def test_trip_only_section_cannot_be_renamed_blank(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	section = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json").data

	r = c.patch(f"/api/trip-sections/{section['id']}/", {"name": " "}, format="json")

	assert r.status_code == 400


@pytest.mark.django_db
def test_section_trip_and_list_cannot_change(auth_client):
	c, _ = auth_client
	trip, other_trip, lst = _trip(c), _trip(c, "Porto"), _list_with_items(c)
	section = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json").data

	assert c.patch(f"/api/trip-sections/{section['id']}/", {"trip": other_trip["id"]}, format="json").status_code == 400
	assert c.patch(f"/api/trip-sections/{section['id']}/", {"saved_list": lst["id"]}, format="json").status_code == 400


@pytest.mark.django_db
def test_delete_section_removes_its_items(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	section = _add_list(c, trip, lst).data

	assert c.delete(f"/api/trip-sections/{section['id']}/").status_code == 204

	assert c.get(f"/api/trips/{trip['id']}/").data["sections"] == []
	assert not TripItem.objects.filter(section_id=section["id"]).exists()


@pytest.mark.django_db
def test_reorder_sections(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	ids = [c.post("/api/trip-sections/", {"trip": trip["id"], "name": n}, format="json").data["id"] for n in "ABC"]

	r = c.post(f"/api/trips/{trip['id']}/reorder-sections/", {"section_ids": [ids[2], ids[0], ids[1]]}, format="json")

	assert r.status_code == 204
	assert [s["name"] for s in c.get(f"/api/trips/{trip['id']}/").data["sections"]] == ["C", "A", "B"]


@pytest.mark.django_db
def test_reorder_needs_exactly_the_trips_sections(auth_client):
	c, _ = auth_client
	trip, other_trip = _trip(c), _trip(c, "Porto")
	a, b = (c.post("/api/trip-sections/", {"trip": trip["id"], "name": n}, format="json").data["id"] for n in "AB")
	stranger = c.post("/api/trip-sections/", {"trip": other_trip["id"], "name": "X"}, format="json").data["id"]
	url = f"/api/trips/{trip['id']}/reorder-sections/"

	for bad in [[a], [a, b, stranger], [a, a], [b, stranger], [[a], [b]], "nope", None]:
		assert c.post(url, {"section_ids": bad}, format="json").status_code == 400, bad

	assert [s["name"] for s in c.get(f"/api/trips/{trip['id']}/").data["sections"]] == ["A", "B"]


def _tick_everything(trip_id):
	TripItem.objects.filter(section__trip_id=trip_id).update(packed=True)


def _packed(trip_id):
	return {i.name: i.packed for i in TripItem.objects.filter(section__trip_id=trip_id)}


@pytest.mark.django_db
def test_untick_all_unticks_the_whole_trip_but_not_removed_items(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	section = _add_list(c, trip, _list_with_items(c)).data
	c.post("/api/trip-items/", {"section": section["id"], "name": "Hat"}, format="json")
	_tick_everything(trip["id"])
	c.delete(f"/api/trip-items/{section['items'][0]['id']}/")  # Shirts becomes a tombstone

	r = c.post(f"/api/trips/{trip['id']}/untick-all/", {}, format="json")

	assert r.status_code == 204
	assert _packed(trip["id"]) == {"Shirts": True, "Sunscreen": False, "Hat": False}


@pytest.mark.django_db
def test_untick_all_can_target_one_section(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	beach = _add_list(c, trip, _list_with_items(c, "Beach")).data
	wedding = c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json").data
	c.post("/api/trip-items/", {"section": wedding["id"], "name": "Suit"}, format="json")
	_tick_everything(trip["id"])

	r = c.post(f"/api/trips/{trip['id']}/untick-all/", {"section": beach["id"]}, format="json")

	assert r.status_code == 204
	assert _packed(trip["id"]) == {"Shirts": False, "Sunscreen": False, "Suit": True}


@pytest.mark.django_db
def test_untick_all_section_must_be_on_this_trip(auth_client):
	c, _ = auth_client
	trip, other_trip = _trip(c), _trip(c, "Porto")
	_add_list(c, trip, _list_with_items(c))
	stranger = c.post("/api/trip-sections/", {"trip": other_trip["id"], "name": "X"}, format="json").data["id"]
	_tick_everything(trip["id"])
	url = f"/api/trips/{trip['id']}/untick-all/"

	for bad in [stranger, 999999, "nope", [stranger]]:
		assert c.post(url, {"section": bad}, format="json").status_code == 400, bad

	assert all(_packed(trip["id"]).values())


@pytest.mark.django_db
def test_untick_all_on_someone_elses_trip_404(auth_client, other_client):
	c, _ = auth_client
	trip = _trip(c)
	_add_list(c, trip, _list_with_items(c))
	_tick_everything(trip["id"])

	assert other_client.post(f"/api/trips/{trip['id']}/untick-all/", {}, format="json").status_code == 404
	assert all(_packed(trip["id"]).values())


def _section_names(c, trip):
	return [(s["name"], len(s["items"])) for s in c.get(f"/api/trips/{trip['id']}/").data["sections"]]


@pytest.mark.django_db
def test_add_lists_adds_each_in_the_order_given(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	beach, hiking = _list_with_items(c, "Beach"), _list_with_items(c, "Hiking")
	c.post("/api/trip-sections/", {"trip": trip["id"], "name": "Wedding"}, format="json")

	r = c.post(f"/api/trips/{trip['id']}/add-lists/", {"saved_lists": [hiking["id"], beach["id"]]}, format="json")

	assert r.status_code == 204
	assert _section_names(c, trip) == [("Wedding", 0), ("Hiking", 2), ("Beach", 2)]


@pytest.mark.django_db
def test_add_lists_adds_none_if_one_is_already_on_the_trip(auth_client):
	c, _ = auth_client
	trip = _trip(c)
	beach, hiking = _list_with_items(c, "Beach"), _list_with_items(c, "Hiking")
	_add_list(c, trip, beach)

	r = c.post(f"/api/trips/{trip['id']}/add-lists/", {"saved_lists": [hiking["id"], beach["id"]]}, format="json")

	assert r.status_code == 400
	assert r.data == {"saved_lists": ["Beach is already on this trip."]}
	assert _section_names(c, trip) == [("Beach", 2)]


@pytest.mark.django_db
def test_add_lists_needs_your_own_lists_once_each(auth_client, other_client):
	c, _ = auth_client
	trip, beach = _trip(c), _list_with_items(c, "Beach")
	adams = _list_with_items(other_client, "Adam's")
	url = f"/api/trips/{trip['id']}/add-lists/"

	for bad in [[], [adams["id"]], [beach["id"], beach["id"]], [999999], ["x"], "nope", None]:
		assert c.post(url, {"saved_lists": bad}, format="json").status_code == 400, bad

	assert _section_names(c, trip) == []


@pytest.mark.django_db
def test_add_lists_to_someone_elses_trip_404(auth_client, other_client):
	c, _ = auth_client
	trip = _trip(c)
	adams = _list_with_items(other_client, "Adam's")

	r = other_client.post(f"/api/trips/{trip['id']}/add-lists/", {"saved_lists": [adams["id"]]}, format="json")

	assert r.status_code == 404
	assert _section_names(c, trip) == []


@pytest.mark.django_db
def test_new_trip_can_start_with_lists(auth_client):
	c, _ = auth_client
	beach, hiking = _list_with_items(c, "Beach"), _list_with_items(c, "Hiking")

	r = c.post("/api/trips/", {"name": "Lisbon", "saved_lists": [beach["id"], hiking["id"]]}, format="json")

	assert r.status_code == 201
	assert [(s["name"], len(s["items"])) for s in r.data["sections"]] == [("Beach", 2), ("Hiking", 2)]


@pytest.mark.django_db
def test_new_trip_with_a_bad_list_is_not_created(auth_client, other_client):
	c, _ = auth_client
	adams = _list_with_items(other_client, "Adam's")

	r = c.post("/api/trips/", {"name": "Lisbon", "saved_lists": [adams["id"]]}, format="json")

	assert r.status_code == 400
	assert c.get("/api/trips/").data == []


@pytest.mark.django_db
def test_sections_belong_to_their_owner(auth_client, other_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	section = _add_list(c, trip, lst).data
	adam_trip = _trip(other_client, "Adam")

	assert other_client.get(f"/api/trip-sections/{section['id']}/").status_code == 404
	assert other_client.patch(f"/api/trip-sections/{section['id']}/", {"name": "X"}, format="json").status_code == 404
	assert other_client.delete(f"/api/trip-sections/{section['id']}/").status_code == 404
	assert (
		other_client.post(f"/api/trips/{trip['id']}/reorder-sections/", {"section_ids": [section["id"]]}).status_code
		== 404
	)
	# Adding your own list to someone else's trip, or their list to your trip.
	assert other_client.post("/api/trip-sections/", {"trip": trip["id"], "name": "X"}, format="json").status_code == 400
	assert _add_list(other_client, adam_trip, lst).status_code == 400


@pytest.mark.django_db
def test_counts_exclude_removed(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	section = _add_list(c, trip, lst).data
	shirts, sunscreen = (TripItem.objects.get(id=i["id"]) for i in section["items"])
	# Set directly: this test is about the counts, not how items get packed or removed.
	shirts.packed = True
	shirts.removed = True
	shirts.save()
	sunscreen.packed = True
	sunscreen.save()

	row = c.get("/api/trips/").data[0]
	detail = c.get(f"/api/trips/{trip['id']}/").data

	assert (row["packed_count"], row["total_count"]) == (1, 1)
	assert [i["name"] for i in detail["sections"][0]["items"]] == ["Sunscreen"]


@pytest.mark.django_db
def test_readd_after_remove_is_fresh(auth_client):
	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	section = _add_list(c, trip, lst).data
	shirts = TripItem.objects.get(id=section["items"][0]["id"])
	shirts.packed = True
	shirts.quantity = 9
	shirts.quantity_overridden = True
	shirts.save()
	c.delete(f"/api/trip-sections/{section['id']}/")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Hat"}, format="json")

	r = _add_list(c, trip, lst)

	assert r.status_code == 201
	assert [(i["name"], i["quantity"], i["packed"]) for i in r.data["items"]] == [
		("Shirts", 4, False),
		("Sunscreen", None, False),
		("Hat", None, False),
	]
	assert not TripItem.objects.filter(section_id=r.data["id"], quantity_overridden=True).exists()


@pytest.mark.django_db
def test_racing_add_of_same_list_is_400_not_500(auth_client, monkeypatch):
	from api import views
	from api.models import TripSection

	c, _ = auth_client
	trip, lst = _trip(c), _list_with_items(c)
	real_perform_create = views.TripSectionViewSet.perform_create

	def other_click_lands_first(self, serializer):
		# perform_create runs after validate() and before the view's own transaction, so this is the
		# double-click window: the duplicate check has passed, and the other request commits first.
		TripSection.objects.create(trip_id=trip["id"], saved_list_id=lst["id"])
		real_perform_create(self, serializer)

	monkeypatch.setattr(views.TripSectionViewSet, "perform_create", other_click_lands_first)

	r = _add_list(c, trip, lst)

	assert r.status_code == 400
	assert r.data == {"saved_list": ["This list is already on this trip."]}
	assert TripSection.objects.filter(trip_id=trip["id"]).count() == 1
	assert not TripItem.objects.filter(section__trip_id=trip["id"]).exists()
