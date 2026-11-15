import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_csrf_endpoint_sets_cookie():
	c = APIClient()
	r = c.get("/api/auth/csrf/")
	assert r.status_code == 200
	assert "csrftoken" in r.cookies


@pytest.fixture
def built_index(settings, tmp_path):
	# Stand-in for `npm run build` output so the test doesn't need a real build.
	(tmp_path / "index.html").write_text('<div id="root"></div>')
	settings.TEMPLATES = [{**settings.TEMPLATES[0], "DIRS": [tmp_path]}]


@pytest.mark.django_db
def test_client_routes_return_the_spa(built_index):
	c = APIClient()
	r = c.get("/trips/5")
	assert r.status_code == 200
	assert b'id="root"' in r.content


@pytest.mark.django_db
def test_missing_static_asset_is_404_not_html(built_index):
	# Before, this returned index.html with a 200, so a broken bundle loaded blank.
	assert APIClient().get("/static/assets/missing.js").status_code == 404
