from datetime import timedelta

from django.utils import timezone

TODAY = timezone.localdate()
# Trips need both dates; tests that aren't about dates use these, which keep the trip current.
UPCOMING = {"start_date": str(TODAY + timedelta(days=30)), "end_date": str(TODAY + timedelta(days=40))}
