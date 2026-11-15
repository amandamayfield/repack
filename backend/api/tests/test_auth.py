import pytest
from django.contrib.auth.models import User
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
	assert c.get("/api/auth/me/").status_code == 401


@pytest.mark.django_db
def test_logout_clears_session():
	c = APIClient()
	c.post("/api/auth/register/", {"username": "amanda", "password": "pw12345!"}, format="json")
	c.post("/api/auth/login/", {"username": "amanda", "password": "pw12345!"}, format="json")
	assert c.post("/api/auth/logout/").status_code == 204
	assert c.get("/api/auth/me/").status_code == 401


@pytest.mark.django_db
def test_register_rejects_weak_password():
	c = APIClient()
	r = c.post("/api/auth/register/", {"username": "amanda", "password": "a"}, format="json")
	assert r.status_code == 400
	assert "password" in r.data


@pytest.mark.django_db
def test_register_rejects_password_similar_to_username():
	c = APIClient()
	r = c.post("/api/auth/register/", {"username": "amandamayfield", "password": "amandamayfield1"}, format="json")
	assert r.status_code == 400
	assert "password" in r.data


@pytest.mark.django_db
def test_login_is_rate_limited():
	c = APIClient()
	for _ in range(10):
		assert c.post("/api/auth/login/", {"username": "x", "password": "wrong"}, format="json").status_code == 400
	assert c.post("/api/auth/login/", {"username": "x", "password": "wrong"}, format="json").status_code == 429


@pytest.mark.django_db
def test_missing_csrf_token_is_403_not_401():
	# CSRF failures must stay distinguishable from "not logged in" (401), or the
	# frontend would log the user out on a CSRF bug.
	User.objects.create_user("amanda", password="pw12345!")
	c = APIClient(enforce_csrf_checks=True)
	assert c.post("/api/auth/login/", {"username": "amanda", "password": "pw12345!"}, format="json").status_code == 200
	assert c.post("/api/auth/logout/").status_code == 403
	assert c.get("/api/auth/me/").status_code == 200  # still logged in
