import pytest


def _seed_trip(c):
	"""A trip with a categorised 'Shirts' (qty 4) and a packed 'Sunscreen', imported from a list."""
	cat = c.post("/api/categories/", {"name": "Clothes"}, format="json").data
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	c.post(
		"/api/saved-list-items/",
		{"saved_list": lst["id"], "name": "Shirts", "quantity": 4, "category": cat["id"]},
		format="json",
	)
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sunscreen"}, format="json")
	trip = c.post(
		"/api/trips/", {"name": "Yosemite", "start_date": "2026-06-01", "end_date": "2026-06-05"}, format="json"
	).data
	c.post(f"/api/trips/{trip['id']}/import-list/", {"saved_list_id": lst["id"]}, format="json")
	items = c.get(f"/api/trips/{trip['id']}/").data["items"]
	sunscreen = next(i for i in items if i["name"] == "Sunscreen")
	c.patch(f"/api/trip-items/{sunscreen['id']}/", {"packed": True}, format="json")
	return c.get(f"/api/trips/{trip['id']}/").data, cat


def _shape(items):
	return [(i["name"], i["quantity"], i["category"]) for i in items]


@pytest.mark.django_db
def test_duplicate_copies_items_unpacked(auth_client):
	c, _ = auth_client
	trip, _ = _seed_trip(c)
	r = c.post(f"/api/trips/{trip['id']}/duplicate/")
	assert r.status_code == 201
	copy = r.data
	assert copy["id"] != trip["id"]
	assert copy["name"] == "Copy of Yosemite"
	assert copy["start_date"] is None and copy["end_date"] is None
	assert _shape(copy["items"]) == _shape(trip["items"])
	assert all(i["packed"] is False for i in copy["items"])
	# The original is untouched.
	original = c.get(f"/api/trips/{trip['id']}/").data
	assert [i["packed"] for i in original["items"]] == [i["packed"] for i in trip["items"]]


@pytest.mark.django_db
def test_duplicate_copies_imported_lists(auth_client):
	c, _ = auth_client
	trip, _ = _seed_trip(c)
	copy = c.post(f"/api/trips/{trip['id']}/duplicate/").data
	assert copy["imported_lists"] == trip["imported_lists"]
	assert copy["imported_lists"] != []


@pytest.mark.django_db
def test_duplicate_truncates_long_name(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "x" * 150}, format="json").data
	copy = c.post(f"/api/trips/{trip['id']}/duplicate/").data
	assert len(copy["name"]) == 150
	assert copy["name"].startswith("Copy of ")


@pytest.mark.django_db
def test_duplicate_others_trip_404(auth_client, other_client):
	c, _ = auth_client
	trip, _ = _seed_trip(c)
	r = other_client.post(f"/api/trips/{trip['id']}/duplicate/")
	assert r.status_code == 404
	assert len(c.get("/api/trips/").data) == 1


@pytest.mark.django_db
def test_save_as_list_copies_items(auth_client):
	c, _ = auth_client
	trip, _ = _seed_trip(c)
	r = c.post(f"/api/trips/{trip['id']}/save-as-list/", {"name": "Europe kit"}, format="json")
	assert r.status_code == 201
	assert r.data["name"] == "Europe kit"
	lst = c.get(f"/api/saved-lists/{r.data['id']}/").data
	assert lst["name"] == "Europe kit"
	assert _shape(lst["items"]) == _shape(trip["items"])
	assert all("packed" not in i for i in lst["items"])


@pytest.mark.django_db
def test_save_as_list_blank_name_400(auth_client):
	c, _ = auth_client
	trip, _ = _seed_trip(c)
	before = len(c.get("/api/saved-lists/").data)
	r = c.post(f"/api/trips/{trip['id']}/save-as-list/", {"name": "  "}, format="json")
	assert r.status_code == 400
	assert "name" in r.data
	assert len(c.get("/api/saved-lists/").data) == before


@pytest.mark.django_db
def test_save_as_list_others_trip_404(auth_client, other_client):
	c, _ = auth_client
	trip, _ = _seed_trip(c)
	r = other_client.post(f"/api/trips/{trip['id']}/save-as-list/", {"name": "Mine now"}, format="json")
	assert r.status_code == 404
	assert other_client.get("/api/saved-lists/").data == []
