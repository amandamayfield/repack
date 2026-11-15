from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Category(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories")
	name = models.CharField(max_length=100)
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]

	def __str__(self):
		return self.name


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
	category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
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
	start_date = models.DateField(null=True, blank=True)
	end_date = models.DateField(null=True, blank=True)
	# Saved lists already copied into this trip; each list can be imported once.
	imported_lists = models.ManyToManyField(SavedList, blank=True, related_name="+")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at"]

	def __str__(self):
		return self.name


class TripItem(models.Model):
	trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="items")
	category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
	name = models.CharField(max_length=150)
	quantity = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
	packed = models.BooleanField(default=False)
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]

	def __str__(self):
		return self.name
