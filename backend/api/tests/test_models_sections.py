import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from api.models import SavedList, SavedListItem, Trip, TripItem, TripSection
from api.tests.dates import UPCOMING


@pytest.fixture
def user(db):
	return User.objects.create_user(username="amanda", password="pw12345!")


@pytest.fixture
def trip(user):
	return Trip.objects.create(user=user, name="Lisbon", **UPCOMING)


@pytest.fixture
def toiletries(user):
	return SavedList.objects.create(user=user, name="Toiletries")


def test_section_display_name_follows_list_until_renamed(trip, toiletries):
	section = TripSection.objects.create(trip=trip, saved_list=toiletries)
	assert section.display_name == "Toiletries"

	toiletries.name = "Wash bag"
	toiletries.save()
	section.refresh_from_db()
	assert section.display_name == "Wash bag"

	section.custom_name = "Lisbon wash bag"
	section.save()
	toiletries.name = "Bathroom"
	toiletries.save()
	section.refresh_from_db()
	assert section.display_name == "Lisbon wash bag"


def test_trip_only_section_requires_name(trip):
	with pytest.raises(ValidationError):
		TripSection(trip=trip, custom_name="  ").full_clean()
	TripSection(trip=trip, custom_name="Wedding").full_clean()


def test_one_section_per_list_per_trip(trip, toiletries):
	TripSection.objects.create(trip=trip, saved_list=toiletries)
	with pytest.raises(IntegrityError):
		TripSection.objects.create(trip=trip, saved_list=toiletries)


def test_many_trip_only_sections_per_trip(trip):
	TripSection.objects.create(trip=trip, custom_name="Wedding")
	TripSection.objects.create(trip=trip, custom_name="Hiking")
	assert trip.sections.count() == 2


def test_deleting_saved_list_unlinks_sections(trip, toiletries):
	section = TripSection.objects.create(trip=trip, saved_list=toiletries)
	TripItem.objects.create(section=section, name="Toothbrush", from_list=True)

	toiletries.delete()

	section.refresh_from_db()
	assert section.saved_list is None
	assert section.display_name == "Deleted list"
	assert section.items.count() == 1


def test_deleting_source_item_nulls_link(trip, toiletries):
	source = SavedListItem.objects.create(saved_list=toiletries, name="Toothbrush")
	section = TripSection.objects.create(trip=trip, saved_list=toiletries)
	item = TripItem.objects.create(section=section, source_item=source, name="Toothbrush", from_list=True)

	source.delete()

	item.refresh_from_db()
	assert item.source_item is None
	assert item.from_list is True
