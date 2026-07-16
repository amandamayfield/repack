import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def auth_client():
	u = User.objects.create_user(username="ann", password="pw12345!")
	c = APIClient(); c.force_authenticate(u)
	return c, u

  
@pytest.mark.django_db
def test_create_trip_and_toggle_packed(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach", "days": 3}, format="json").data
	item = c.post("/api/trip-items/", {"trip": trip["id"], "name": "Towel", "order": 0}, format="json").data
	assert item["packed"] is False
	r = c.patch(f"/api/trip-items/{item['id']}/", {"packed": True}, format="json")
	assert r.status_code == 200 and r.data["packed"] is True
 

@pytest.mark.django_db
def test_trip_list_includes_progress_counts(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach"}, format="json").data
	i1 = c.post("/api/trip-items/", {"trip": trip["id"], "name": "A", "order": 0}, format="json").data
	c.post("/api/trip-items/", {"trip": trip["id"], "name": "B", "order": 1}, format="json")
	c.patch(f"/api/trip-items/{i1['id']}/", {"packed": True}, format="json")

	row = c.get("/api/trips/").data[0]
	assert row["total_count"] == 2
	assert row["packed_count"] == 1

  
@pytest.mark.django_db
def test_trip_isolation(auth_client):
	c, _ = auth_client
	trip = c.post("/api/trips/", {"name": "Beach"}, format="json").data
	adam = APIClient(); adam.force_authenticate(User.objects.create_user("adam", password="pw12345!"))
	assert adam.get(f"/api/trips/{trip['id']}/").status_code == 404