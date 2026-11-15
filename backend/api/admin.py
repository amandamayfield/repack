from django.contrib import admin

from .models import Category, SavedList, SavedListItem, Trip, TripItem


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
	list_display = ["name", "user", "order"]


@admin.register(SavedList)
class SavedListAdmin(admin.ModelAdmin):
	list_display = ["name", "user", "updated_at"]


@admin.register(SavedListItem)
class SavedListItemAdmin(admin.ModelAdmin):
	list_display = ["name", "saved_list", "category", "quantity", "order"]


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
	list_display = ["name", "user", "start_date", "end_date", "updated_at"]


@admin.register(TripItem)
class TripItemAdmin(admin.ModelAdmin):
	list_display = ["name", "trip", "category", "quantity", "packed", "order"]
