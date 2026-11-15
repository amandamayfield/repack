import pytest


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
	trip = c.post("/api/trips/", {"name": "Lisbon"}, format="json").data
	r = other_client.post(f"/api/trips/{trip['id']}/duplicate/")
	assert r.status_code == 404
	assert len(c.get("/api/trips/").data) == 1
