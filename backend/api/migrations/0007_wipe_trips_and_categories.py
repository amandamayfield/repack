from django.db import migrations


def wipe(apps, schema_editor):
	# Test data only (user's call): trips can't be mapped onto sections, and categories are going away.
	apps.get_model("api", "TripItem").objects.all().delete()
	apps.get_model("api", "Trip").objects.all().delete()
	apps.get_model("api", "Category").objects.all().delete()


class Migration(migrations.Migration):
	dependencies = [("api", "0006_remove_trip_days")]

	operations = [migrations.RunPython(wipe, migrations.RunPython.noop)]
