import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

  
@pytest.fixture
def auth_client():
	u = User.objects.create_user(username="amanda", password="pw12345!")
	c = APIClient(); c.force_authenticate(u)
	return c, u
 

def _seed_list(c):
	lst = c.post("/api/saved-lists/", {"name": "Camping"}, format="json").data
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Shirts",
	"quantity": 4, "order": 0}, format="json")
	c.post("/api/saved-list-items/", {"saved_list": lst["id"], "name": "Sunscreen",
	"order": 1}, format="json")
	return lst

  
@pytest.mark.django_db
def test_import_copies_items(auth_client):
	c, _ = auth_client
	lst = _seed_list(c)
	trip = c.post("/api/trips/", {"name": "Yosemite"}, format="json").data
	r = c.post(f"/api/trips/{trip['id']}/import_/", {"saved_list_id": lst["id"]}, format="json")
	assert r.status_code == 201
	items = c.get(f"/api/trips/{trip['id']}/").data["items"]
	names = {i["name"]: i for i in items}
	assert set(names) == {"Shirts", "Sunscreen"}
	assert names["Shirts"]["quantity"] == 4
	assert all(i["packed"] is False for i in items) # copies start unpacked


@pytest.mark.django_db
def test_import_decouples_from_blueprint(auth_client):
	c, _ = auth_client
	lst = _seed_list(c)
	trip = c.post("/api/trips/", {"name": "Yosemite"}, format="json").data
	c.post(f"/api/trips/{trip['id']}/import_/", {"saved_list_id": lst["id"]}, format="json")
	# Pack an item in the TRIP:
	trip_item_id = c.get(f"/api/trips/{trip['id']}/").data["items"][0]["id"]
	c.patch(f"/api/trip-items/{trip_item_id}/", {"packed": True}, format="json")
	# The TEMPLATE is untouched:
	blueprint_items = c.get(f"/api/saved-lists/{lst['id']}/").data["items"]
	assert all("packed" not in i for i in blueprint_items)
	assert len(blueprint_items) == 2

  
@pytest.mark.django_db
def test_cannot_import_others_list(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Yosemite"}, format="json").data
	adam = APIClient(); adam.force_authenticate(User.objects.create_user("adam", password="pw12345!"))
	adam_list = adam.post("/api/saved-lists/", {"name": "Adam"}, format="json").data
	r = c.post(f"/api/trips/{trip['id']}/import_/", {"saved_list_id": adam_list["id"]}, format="json")
	assert r.status_code in (400, 404)