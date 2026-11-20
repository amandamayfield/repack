from datetime import timedelta

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from api.tests.dates import TODAY

BEFORE = [("api", "0009_unique_trip_name_per_user")]
AFTER = [("api", "0011_trip_dates_required")]


@pytest.mark.django_db(transaction=True)
def test_trips_missing_a_date_are_deleted():
	executor = MigrationExecutor(connection)
	executor.migrate(BEFORE)
	apps = executor.loader.project_state(BEFORE).apps
	user = apps.get_model("auth", "User").objects.create(username="amanda")
	Trip = apps.get_model("api", "Trip")
	past, soon = TODAY - timedelta(days=10), TODAY + timedelta(days=10)
	for name, start, end in [
		("Undated", None, None),
		("Ended", None, past),
		("Ends soon", None, soon),
		("Starts soon", soon, None),
		("Dated", past, soon),
	]:
		Trip.objects.create(user=user, name=name, start_date=start, end_date=end)

	executor = MigrationExecutor(connection)
	executor.migrate(AFTER)
	Trip = executor.loader.project_state(AFTER).apps.get_model("api", "Trip")

	assert [(t.name, t.start_date, t.end_date) for t in Trip.objects.all()] == [("Dated", past, soon)]
