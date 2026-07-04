import pytest

@pytest.mark.django_db

def test_database_is_reachable():
	from django.db import connection
	with connection.cursor() as cur:
		cur.execute("SELECT 1")
		assert cur.fetchone()[0] == 1