import pytest
from rest_framework.test import APIClient

  
@pytest.mark.django_db
def test_csrf_endpoint_sets_cookie():
	c = APIClient()
	r = c.get("/api/auth/csrf/")
	assert r.status_code == 200
	assert "csrftoken" in r.cookies