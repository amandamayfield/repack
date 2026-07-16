from django.db import models

# Create your models here.
from django.conf import settings
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


class SavedListItem(models.Model):
	saved_list = models.ForeignKey(SavedList, on_delete=models.CASCADE, related_name="items")
	category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
	name = models.CharField(max_length=150)
	quantity = models.PositiveIntegerField(null=True, blank=True)
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]


class Trip(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trips")
	name = models.CharField(max_length=150)
	days = models.PositiveIntegerField(null=True, blank=True)
	start_date = models.DateField(null=True, blank=True)
	end_date = models.DateField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at"]
		

class TripItem(models.Model):
	trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="items")
	category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
	name = models.CharField(max_length=150)
	quantity = models.PositiveIntegerField(null=True, blank=True)
	packed = models.BooleanField(default=False)
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]