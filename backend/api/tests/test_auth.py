import pytest
from rest_framework.test import APIClient

@pytest.mark.django_db
def test_register_then_login_then_me():
	c = APIClient()
	r = c.post("/api/auth/register/", {"username": "amanda", "password": "pw12345!"}, format="json")
	assert r.status_code == 201
	assert r.data["username"] == "amanda"

	r = c.post("/api/auth/login/", {"username": "amanda", "password": "pw12345!"}, format="json")
	assert r.status_code == 200

	r = c.get("/api/auth/me/")
	assert r.status_code == 200
	assert r.data["username"] == "amanda"

@pytest.mark.django_db
def test_me_requires_auth():
	c = APIClient()
	assert c.get("/api/auth/me/").status_code == 403

@pytest.mark.django_db
def test_logout_clears_session():
	c = APIClient()
	c.post("/api/auth/register/", {"username": "amanda", "password": "pw12345!"}, format="json")
	c.post("/api/auth/login/", {"username": "amanda", "password": "pw12345!"}, format="json")
	assert c.post("/api/auth/logout/").status_code == 204
	assert c.get("/api/auth/me/").status_code == 403