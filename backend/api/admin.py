from django.contrib import admin

from .models import SavedList, SavedListItem, Trip, TripItem, TripSection


@admin.register(SavedList)
class SavedListAdmin(admin.ModelAdmin):
	list_display = ["name", "user", "updated_at"]


@admin.register(SavedListItem)
class SavedListItemAdmin(admin.ModelAdmin):
	list_display = ["name", "saved_list", "quantity", "order"]


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
	list_display = ["name", "user", "start_date", "end_date", "updated_at"]


@admin.register(TripSection)
class TripSectionAdmin(admin.ModelAdmin):
	list_display = ["display_name", "trip", "saved_list", "order"]


@admin.register(TripItem)
class TripItemAdmin(admin.ModelAdmin):
	list_display = ["name", "section", "quantity", "packed", "removed", "order"]
