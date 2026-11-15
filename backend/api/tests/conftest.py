import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _isolate_security_settings(settings):
	# Throttle counters live in the cache; reset so tests can't throttle each other.
	cache.clear()
	# The test client speaks plain HTTP; don't let a non-DEBUG env 301 every request.
	settings.SECURE_SSL_REDIRECT = False


@pytest.fixture
def client_for(db):
	"""Factory: an APIClient logged in as a new user. Returns (client, user)."""

	def _make(username):
		user = User.objects.create_user(username=username, password="pw12345!")
		client = APIClient()
		client.force_authenticate(user)
		return client, user

	return _make


@pytest.fixture
def auth_client(client_for):
	return client_for("amanda")


@pytest.fixture
def other_client(client_for):
	"""A second, unrelated user, for checking one user can't touch another's data."""
	client, _ = client_for("adam")
	return client
