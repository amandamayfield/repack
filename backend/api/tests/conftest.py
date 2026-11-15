import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolate_security_settings(settings):
	# Throttle counters live in the cache; reset so tests can't throttle each other.
	cache.clear()
	# The test client speaks plain HTTP; don't let a non-DEBUG env 301 every request.
	settings.SECURE_SSL_REDIRECT = False
