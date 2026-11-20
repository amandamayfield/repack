from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models.functions import Lower


class SavedList(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_lists")
	name = models.CharField(max_length=150)
	description = models.TextField(blank=True, default="")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at"]

	def __str__(self):
		return self.name


class SavedListItem(models.Model):
	saved_list = models.ForeignKey(SavedList, on_delete=models.CASCADE, related_name="items")
	name = models.CharField(max_length=150)
	quantity = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]

	def __str__(self):
		return self.name


class Trip(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trips")
	name = models.CharField(max_length=150)
	start_date = models.DateField()
	end_date = models.DateField()
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at"]
		# Backs up TripDetailSerializer.validate_name, which two requests at once can both pass.
		constraints = [models.UniqueConstraint(Lower("name"), "user", name="unique_trip_name_per_user")]

	def __str__(self):
		return self.name


class TripSection(models.Model):
	trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="sections")
	# Null means trip-only. SET_NULL so past trips keep the section when its list is deleted.
	saved_list = models.ForeignKey(
		SavedList, on_delete=models.SET_NULL, null=True, blank=True, related_name="trip_sections"
	)
	# Overrides the list's name on this trip only; required for trip-only sections.
	custom_name = models.CharField(max_length=150, blank=True, default="")
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]
		constraints = [models.UniqueConstraint(fields=["trip", "saved_list"], name="one_section_per_list_per_trip")]

	def clean(self):
		if self.saved_list_id is None and not self.custom_name.strip():
			raise ValidationError({"custom_name": "A section needs a name."})

	@property
	def display_name(self):
		if self.custom_name:
			return self.custom_name
		# The fallback covers a list deleted without going through sync (e.g. from the admin).
		return self.saved_list.name if self.saved_list else "Deleted list"

	def __str__(self):
		return self.display_name


class TripItem(models.Model):
	section = models.ForeignKey(TripSection, on_delete=models.CASCADE, related_name="items")
	# SET_NULL so past trips keep their copy when the list item is deleted.
	source_item = models.ForeignKey(
		SavedListItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="trip_items"
	)
	# Synced from the list, or a trip-only extra. Can't be inferred from source_item, which may be nulled.
	from_list = models.BooleanField(default=False)
	name = models.CharField(max_length=150)
	quantity = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
	packed = models.BooleanField(default=False)
	# The trip set its own amount, so list quantity changes no longer apply.
	quantity_overridden = models.BooleanField(default=False)
	# Deleted on this trip; kept as a tombstone so sync doesn't add it back.
	removed = models.BooleanField(default=False)
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]

	def __str__(self):
		return self.name
