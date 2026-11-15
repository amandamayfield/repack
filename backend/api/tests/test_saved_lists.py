import pytest


@pytest.mark.django_db
def test_create_saved_list_with_items(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	r = c.post(
		"/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shirts", "quantity": 4, "order": 0}, format="json"
	)
	assert r.status_code == 201
	r2 = c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sunscreen", "order": 1}, format="json")
	assert r2.status_code == 201
	assert r2.data["quantity"] is None  # quantity is optional

	detail = c.get(f"/api/saved-lists/{lst['id']}/").data
	assert len(detail["items"]) == 2


@pytest.mark.django_db
def test_cannot_add_item_to_others_list(auth_client, other_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	adam = other_client
	r = adam.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sneaky", "order": 0}, format="json")
	assert r.status_code == 400  # validate_saved_list: "Not your list."


@pytest.mark.django_db
def test_item_accepts_own_category(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	cat = c.post("/api/categories/", {"name": "Clothes", "order": 0}, format="json").data
	r = c.post(
		"/api/saved-list-items/",
		{"saved_list": lst["id"], "category": cat["id"], "name": "Shirts", "order": 0},
		format="json",
	)
	assert r.status_code == 201
	assert r.data["category"] == cat["id"]


@pytest.mark.django_db
def test_item_rejects_others_category(auth_client, other_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	adam = other_client
	adam_cat = adam.post("/api/categories/", {"name": "Adam Cat", "order": 0}, format="json").data
	r = c.post(
		"/api/saved-list-items/",
		{"saved_list": lst["id"], "category": adam_cat["id"], "name": "Sneaky", "order": 0},
		format="json",
	)
	assert r.status_code == 400
	assert "category" in r.data


@pytest.mark.django_db
def test_server_assigns_order_ignoring_client_value(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	ids = [
		c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": n, "order": 0}, format="json").data["id"]
		for n in ("A", "B", "C")
	]
	c.delete(f"/api/saved-list-items/{ids[1]}/")
	# Client-side `items.length` would have been 2 here, colliding with "C".
	r = c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "D"}, format="json")
	assert r.data["order"] == 3
	names = [i["name"] for i in c.get(f"/api/saved-lists/{lst['id']}/").data["items"]]
	assert names == ["A", "C", "D"]


@pytest.mark.django_db
def test_quantity_must_be_at_least_one(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	r = c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Socks", "quantity": 0}, format="json")
	assert r.status_code == 400
	assert "quantity" in r.data


@pytest.mark.django_db
def test_list_endpoint_returns_summaries_without_items(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shirts"}, format="json")
	row = c.get("/api/saved-lists/").data[0]
	assert row["name"] == "Camping"
	assert "items" not in row


@pytest.mark.django_db
def test_rename_and_delete_own_list(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shirts"}, format="json")
	r = c.patch(f"/api/saved-lists/{lst['id']}/", {"name": "Backpacking"}, format="json")
	assert r.status_code == 200 and r.data["name"] == "Backpacking"
	assert c.delete(f"/api/saved-lists/{lst['id']}/").status_code == 204
	assert c.get("/api/saved-list-items/").data == []  # items cascade with the list


@pytest.mark.django_db
def test_cannot_change_or_delete_others_list(auth_client, other_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	assert other_client.patch(f"/api/saved-lists/{lst['id']}/", {"name": "Mine now"}, format="json").status_code == 404
	assert other_client.delete(f"/api/saved-lists/{lst['id']}/").status_code == 404
	assert c.get(f"/api/saved-lists/{lst['id']}/").data["name"] == "Camping"


@pytest.mark.django_db
def test_cannot_touch_others_items_or_move_items_onto_their_list(auth_client, other_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	item = c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shirts"}, format="json").data
	adam_list = other_client.post("/api/saved-lists/", {"name": "Adam"}, format="json").data
	# Another user can't see, edit or delete my item...
	assert other_client.patch(f"/api/saved-list-items/{item['id']}/", {"name": "X"}, format="json").status_code == 404
	assert other_client.delete(f"/api/saved-list-items/{item['id']}/").status_code == 404
	# ...and I can't re-point my item at their list.
	r = c.patch(f"/api/saved-list-items/{item['id']}/", {"saved_list": adam_list["id"]}, format="json")
	assert r.status_code == 400
