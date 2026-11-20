"""One-way sync from saved lists to the sections of current trips.

A trip is current when it ends today or later; past trips keep what they had.
Views call these explicitly, inside the same transaction as the list change.
"""

from django.db.models import Q
from django.utils import timezone

from .models import Trip, TripItem, TripSection


def _current(prefix=""):
	return Q(**{f"{prefix}end_date__gte": timezone.localdate()})


def is_current(trip):
	return trip.end_date >= timezone.localdate()


def _renumber(section):
	"""Synced items in the list's order, then extras in the order they were added."""
	items = list(section.items.select_related("source_item"))
	synced = sorted(
		(i for i in items if i.from_list),
		key=lambda i: (i.source_item.order, i.source_item_id) if i.source_item else (-1, i.order),
	)
	extras = sorted((i for i in items if not i.from_list), key=lambda i: (i.order, i.id))
	for order, item in enumerate(synced + extras):
		item.order = order
	TripItem.objects.bulk_update(items, ["order"])


def _copy(section, source):
	return TripItem(section=section, source_item=source, from_list=True, name=source.name, quantity=source.quantity)


def _amount_went_up(old, new):
	"""Less than before is already packed, so only more needs a fresh tick. A blank amount counts as one."""
	return (new or 1) > (old or 1)


def sync_item_created(item):
	sections = TripSection.objects.filter(Q(saved_list=item.saved_list) & _current("trip__"))
	for section in sections:
		_copy(section, item).save()
		_renumber(section)


def sync_item_updated(item, old_name, old_quantity):
	"""Returns the names of the trips where a ticked copy got unticked."""
	# Removed items are kept up to date too, so restoring one brings back the list as it is now.
	linked = TripItem.objects.filter(Q(source_item=item) & _current("section__trip__"))
	# The trip's own amount wins, and its tick stays.
	follows = linked.filter(quantity_overridden=False)
	renamed = item.name != old_name
	untick = linked if renamed else follows if _amount_went_up(old_quantity, item.quantity) else linked.none()
	ticked = untick.filter(packed=True, removed=False).values_list("section__trip__name", flat=True)
	unticked_trips = sorted(set(ticked), key=str.casefold)
	if renamed:
		linked.update(name=item.name)
	if item.quantity != old_quantity:
		follows.update(quantity=item.quantity)
	untick.update(packed=False)
	return unticked_trips


def sync_item_deleted(item):
	"""Call before deleting `item`. Past trips' copies are then unlinked by SET_NULL."""
	TripItem.objects.filter(Q(source_item=item) & _current("section__trip__")).delete()


def sync_list_renamed(saved_list, old_name):
	"""Past sections showing the list's name keep the old one."""
	TripSection.objects.filter(saved_list=saved_list, custom_name="").exclude(_current("trip__")).update(
		custom_name=old_name
	)


def sync_list_deleted(saved_list):
	"""Call before deleting `saved_list`. Past sections stay, as trip-only headings."""
	sections = TripSection.objects.filter(saved_list=saved_list)
	sections.filter(_current("trip__")).delete()
	sections.filter(custom_name="").update(custom_name=saved_list.name)
	past_items = TripItem.objects.filter(section__saved_list=saved_list)
	past_items.filter(removed=True).delete()
	past_items.update(from_list=False)


def catch_up_trip(trip):
	"""Bring a trip that has just become current up to date with its lists."""
	for section in trip.sections.filter(saved_list__isnull=False).select_related("saved_list"):
		section.items.filter(from_list=True, source_item__isnull=True).delete()
		linked = {i.source_item_id: i for i in section.items.filter(from_list=True)}
		for source in section.saved_list.items.all():
			item = linked.get(source.id)
			if item is None:
				_copy(section, source).save()
				continue
			if item.name != source.name:
				item.name, item.packed = source.name, False
			if item.quantity != source.quantity and not item.quantity_overridden:
				if _amount_went_up(item.quantity, source.quantity):
					item.packed = False
				item.quantity = source.quantity
			item.save(update_fields=["name", "quantity", "packed"])
		_renumber(section)


def copy_name(trip):
	"""The first free "Copy of <name>", then "(2)", "(3)"…, cut to fit the 150-character limit. Trip names are
	unique per user, ignoring case."""
	taken = {n.casefold() for n in Trip.objects.filter(user=trip.user).values_list("name", flat=True)}
	base = f"Copy of {trip.name}"
	number = 1
	while True:
		suffix = "" if number == 1 else f" ({number})"
		name = base[: 150 - len(suffix)] + suffix
		if name.casefold() not in taken:
			return name
		number += 1


def duplicate_trip(trip, name, start_date, end_date):
	"""A fresh, unticked copy, named and dated as given. Synced sections
	are rebuilt from their lists as they are now, keeping this trip's own amounts and deletions; everything else
	is copied."""
	copy = Trip.objects.create(user=trip.user, name=name, start_date=start_date, end_date=end_date)
	for section in trip.sections.prefetch_related("items"):
		new = TripSection.objects.create(
			trip=copy, saved_list=section.saved_list, custom_name=section.custom_name, order=section.order
		)
		items = section.items.all()
		if section.saved_list_id is not None:
			changes = {i.source_item_id: i for i in items if i.from_list and i.source_item_id}
			for source in section.saved_list.items.all():
				item = _copy(new, source)
				old = changes.get(source.id)
				if old is not None:
					item.removed = old.removed
					if old.quantity_overridden:
						item.quantity, item.quantity_overridden = old.quantity, True
				item.save()
		TripItem.objects.bulk_create(
			TripItem(section=new, name=i.name, quantity=i.quantity, order=i.order) for i in items if not i.from_list
		)
		_renumber(new)
	return copy
