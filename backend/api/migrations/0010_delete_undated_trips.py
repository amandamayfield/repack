from django.db import migrations
from django.db.models import Q


def delete_undated(apps, schema_editor):
	"""0011 requires both dates. Trips missing either are deleted rather than given made-up dates."""
	Trip = apps.get_model("api", "Trip")
	Trip.objects.filter(Q(start_date__isnull=True) | Q(end_date__isnull=True)).delete()


class Migration(migrations.Migration):
	dependencies = [
		("api", "0009_unique_trip_name_per_user"),
	]

	# The deleted trips can't be brought back, so reversing does nothing.
	operations = [migrations.RunPython(delete_undated, migrations.RunPython.noop)]
