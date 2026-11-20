from django.db import migrations, models


class Migration(migrations.Migration):
	dependencies = [
		("api", "0010_delete_undated_trips"),
	]

	operations = [
		migrations.AlterField(model_name="trip", name="start_date", field=models.DateField()),
		migrations.AlterField(model_name="trip", name="end_date", field=models.DateField()),
	]
