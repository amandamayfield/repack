import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

@pytest.fixture
def auth_client():
	u = User.objects.create_user(username="amanda", password="pw12345!")
	c = APIClient(); c.force_authenticate(u)
	return c, u

@pytest.mark.django_db
def test_create_saved_list_with_items(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	r = c.post("/api/saved-list-items/",
		{"saved_list": lst["id"], "name": "Shirts", "quantity": 4, "order": 0}, format="json")
	assert r.status_code == 201
	r2 = c.post("/api/saved-list-items/",
		{"saved_list": lst["id"], "name": "Sunscreen", "order": 1},
format="json")
	assert r2.status_code == 201
	assert r2.data["quantity"] is None # quantity is optional
	
	detail = c.get(f"/api/saved-lists/{lst['id']}/").data
	assert len(detail["items"]) == 2

@pytest.mark.django_db
def test_cannot_add_item_to_others_list(auth_client):
	c, _ = auth_client
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	adam = APIClient(); adam.force_authenticate(User.objects.create_user("adam", password="pw12345!"))
	r = adam.post("/api/saved-list-items/",
	{"saved_list": lst["id"], "name": "Sneaky", "order": 0}, format="json")
	assert r.status_code in (400, 403, 404)