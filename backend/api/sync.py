"""One-way sync from saved lists to the sections of current trips.

A trip is current when it has no end date or ends today or later; past trips keep what they had.
Views call these explicitly, inside the same transaction as the list change.
"""

from django.db.models import Q
from django.utils import timezone

from .models import TripItem, TripSection


def _current(prefix=""):
	today = timezone.localdate()
	return Q(**{f"{prefix}end_date__isnull": True}) | Q(**{f"{prefix}end_date__gte": today})


def is_current(trip):
	return trip.end_date is None or trip.end_date >= timezone.localdate()


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


def sync_item_created(item):
	sections = TripSection.objects.filter(Q(saved_list=item.saved_list) & _current("trip__"))
	for section in sections:
		_copy(section, item).save()
		_renumber(section)


def sync_item_updated(item, old_name, old_quantity):
	linked = TripItem.objects.filter(Q(source_item=item, removed=False) & _current("section__trip__"))
	if item.name != old_name:
		linked.update(name=item.name, packed=False)
	if item.quantity != old_quantity:
		# The trip's own amount wins, and its tick stays.
		linked.filter(quantity_overridden=False).update(quantity=item.quantity, packed=False)


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
			if item.removed:
				continue
			if item.name != source.name:
				item.name, item.packed = source.name, False
			if item.quantity != source.quantity and not item.quantity_overridden:
				item.quantity, item.packed = source.quantity, False
			item.save(update_fields=["name", "quantity", "packed"])
		_renumber(section)
