import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def auth_client():
	u = User.objects.create_user(username="amanda", password="pw12345!")
	c = APIClient()
	c.force_authenticate(u)
	return c, u


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
def test_cannot_add_item_to_others_list(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	adam = APIClient()
	adam.force_authenticate(User.objects.create_user("adam", password="pw12345!"))
	r = adam.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sneaky", "order": 0}, format="json")
	assert r.status_code in (400, 403, 404)


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
def test_item_rejects_others_category(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	adam = APIClient()
	adam.force_authenticate(User.objects.create_user("adam", password="pw12345!"))
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
