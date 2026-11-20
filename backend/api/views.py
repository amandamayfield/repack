from contextlib import contextmanager

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Max, Q
from django.db.models.functions import Lower
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import sync
from .models import SavedList, SavedListItem, Trip, TripItem, TripSection
from .permissions import IsOwner
from .serializers import (
	SavedListItemSerializer,
	SavedListSerializer,
	SavedListSummarySerializer,
	TripDetailSerializer,
	TripItemSerializer,
	TripListSerializer,
	TripSectionSerializer,
	trip_name_taken,
)


def next_order(siblings):
	"""The `order` for a new item appended after `siblings` (0 if there are none)."""
	current_max = siblings.aggregate(m=Max("order"))["m"]
	return 0 if current_max is None else current_max + 1


def copy_list_items(section, saved_list):
	TripItem.objects.bulk_create(
		[
			TripItem(
				section=section,
				source_item=src,
				from_list=True,
				name=src.name,
				quantity=src.quantity,
				order=i,
			)
			for i, src in enumerate(saved_list.items.all())
		]
	)


def lists_to_add(request, trip=None):
	"""The user's saved lists named by `saved_lists`, in the order given. Any bad id is a 400 for them all."""
	ids = request.data.get("saved_lists")
	valid = isinstance(ids, list) and ids and all(isinstance(i, int) for i in ids) and len(set(ids)) == len(ids)
	lists = SavedList.objects.filter(user=request.user).in_bulk(ids) if valid else {}
	if not valid or len(lists) != len(ids):
		raise serializers.ValidationError({"saved_lists": ["Pick one or more of your saved lists, once each."]})
	if trip is not None:
		on_trip = trip.sections.filter(saved_list__in=ids).select_related("saved_list").first()
		if on_trip is not None:
			raise serializers.ValidationError({"saved_lists": [f"{on_trip.saved_list.name} is already on this trip."]})
	return [lists[i] for i in ids]


@contextmanager
def saving_trip_name(name):
	"""Atomic, and turns a name another request saved first into the same 400 that validate_name gives."""
	try:
		with transaction.atomic():
			yield
	except IntegrityError as error:
		if "unique_trip_name_per_user" not in str(error):
			raise
		raise serializers.ValidationError({"name": [trip_name_taken(name)]}) from None


def with_same_items(trip, items):
	"""`items` and every live item on `trip` with the same name, ignoring case. The same thing in two sections
	is one thing to pack, so they share a tick."""
	names = items.annotate(lname=Lower("name")).values("lname")
	return (
		TripItem.objects.filter(section__trip=trip, removed=False).annotate(lname=Lower("name")).filter(lname__in=names)
	)


def move_one_step(item, siblings, direction):
	"""Swap `item` with its neighbour among `siblings`, numbering them 0, 1, 2…; a 400 at either end."""
	if direction not in ("up", "down"):
		raise serializers.ValidationError({"direction": ['Send "up" or "down".']})
	ordered = list(siblings.order_by("order", "id"))
	here = ordered.index(item)
	there = here - 1 if direction == "up" else here + 1
	if not 0 <= there < len(ordered):
		raise serializers.ValidationError({"direction": [f"It's already {'first' if direction == 'up' else 'last'}."]})
	ordered[here], ordered[there] = ordered[there], ordered[here]
	for order, sibling in enumerate(ordered):
		sibling.order = order
	type(item).objects.bulk_update(ordered, ["order"])


def add_list_sections(trip, saved_lists):
	start = next_order(trip.sections.all())
	for offset, saved_list in enumerate(saved_lists):
		section = TripSection.objects.create(trip=trip, saved_list=saved_list, order=start + offset)
		copy_list_items(section, saved_list)


class OwnedModelViewSet(viewsets.ModelViewSet):
	"""Base class: scope every query to the current user, and stamp
	the current user as owner whenever something is created."""

	permission_classes = [IsAuthenticated, IsOwner]

	def get_queryset(self):
		return self.queryset.filter(user=self.request.user)

	def perform_create(self, serializer):
		serializer.save(user=self.request.user)


class SavedListViewSet(OwnedModelViewSet):
	queryset = SavedList.objects.all()

	def get_serializer_class(self):
		# Same split as trips: names for the list, embedded items for one list.
		return SavedListSummarySerializer if self.action == "list" else SavedListSerializer

	def get_queryset(self):
		qs = super().get_queryset()
		if self.action != "list":
			qs = qs.prefetch_related("items")
		return qs

	@transaction.atomic
	def perform_update(self, serializer):
		old_name = serializer.instance.name
		saved_list = serializer.save()
		if saved_list.name != old_name:
			sync.sync_list_renamed(saved_list, old_name)

	@transaction.atomic
	def perform_destroy(self, saved_list):
		sync.sync_list_deleted(saved_list)
		saved_list.delete()


class SavedListItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = SavedListItemSerializer

	def get_queryset(self):
		# Items are owned indirectly, through their parent list's user.
		return SavedListItem.objects.filter(saved_list__user=self.request.user)

	def perform_create(self, serializer):
		# The server owns ordering on create, so deletes can't cause collisions.
		saved_list = serializer.validated_data["saved_list"]
		with transaction.atomic():
			item = serializer.save(order=next_order(saved_list.items.all()))
			sync.sync_item_created(item)

	def update(self, request, *args, **kwargs):
		response = super().update(request, *args, **kwargs)
		response.data["unticked_trips"] = self.unticked_trips
		return response

	@transaction.atomic
	def perform_update(self, serializer):
		old_name, old_quantity = serializer.instance.name, serializer.instance.quantity
		item = serializer.save()
		self.unticked_trips = sync.sync_item_updated(item, old_name, old_quantity)

	@transaction.atomic
	def perform_destroy(self, item):
		sync.sync_item_deleted(item)
		item.delete()

	@action(detail=True, methods=["post"])
	def move(self, request, pk=None):
		item = self.get_object()
		with transaction.atomic():
			move_one_step(item, item.saved_list.items.all(), request.data.get("direction"))
			sync.sync_list_reordered(item.saved_list)
		return Response(status=status.HTTP_204_NO_CONTENT)


class TripViewSet(OwnedModelViewSet):
	queryset = Trip.objects.all()

	def get_serializer_class(self):
		# Use the lightweight serializer for the list, the full one otherwise.
		return TripListSerializer if self.action == "list" else TripDetailSerializer

	def get_queryset(self):
		qs = super().get_queryset()  # already filtered to request.user
		if self.action == "list":
			# Items are counted by name, so one in two sections counts once, and as packed only if every copy is.
			live = Q(sections__items__removed=False)
			name = Lower("sections__items__name")
			qs = qs.annotate(
				total_count=Count(name, distinct=True, filter=live),
				unpacked_count=Count(name, distinct=True, filter=live & Q(sections__items__packed=False)),
			).annotate(packed_count=F("total_count") - F("unpacked_count"))
		else:
			qs = qs.prefetch_related("sections__saved_list", "sections__items__source_item")
		return qs

	def perform_create(self, serializer):
		saved_lists = lists_to_add(self.request) if "saved_lists" in self.request.data else []
		with saving_trip_name(serializer.validated_data["name"]):
			trip = serializer.save(user=self.request.user)
			add_list_sections(trip, saved_lists)

	def perform_update(self, serializer):
		was_current = sync.is_current(serializer.instance)
		with saving_trip_name(serializer.validated_data.get("name")):
			trip = serializer.save()
			if not was_current and sync.is_current(trip):
				sync.catch_up_trip(trip)

	@action(detail=True, methods=["post"], url_path="reorder-sections")
	def reorder_sections(self, request, pk=None):
		trip = self.get_object()
		ids = request.data.get("section_ids")
		sections = {s.id: s for s in trip.sections.all()}
		# A partial or padded list would leave two sections sharing an order.
		valid = isinstance(ids, list) and all(isinstance(i, int) for i in ids)
		if not valid or len(ids) != len(sections) or set(ids) != set(sections):
			return Response(
				{"section_ids": ["Send every section of this trip, once each."]}, status=status.HTTP_400_BAD_REQUEST
			)
		for order, section_id in enumerate(ids):
			sections[section_id].order = order
		TripSection.objects.bulk_update(sections.values(), ["order"])
		return Response(status=status.HTTP_204_NO_CONTENT)

	@action(detail=True, methods=["post"], url_path="add-lists")
	def add_lists(self, request, pk=None):
		trip = self.get_object()
		saved_lists = lists_to_add(request, trip)
		try:
			with transaction.atomic():
				add_list_sections(trip, saved_lists)
		except IntegrityError:
			# Two adds of the same list racing past lists_to_add(), e.g. a double click.
			raise serializers.ValidationError(
				{"saved_lists": ["One of those lists is already on this trip."]}
			) from None
		return Response(status=status.HTTP_204_NO_CONTENT)

	@action(detail=True, methods=["post"], url_path="untick-all")
	def untick_all(self, request, pk=None):
		trip = self.get_object()
		items = TripItem.objects.filter(section__trip=trip, removed=False)
		section_id = request.data.get("section")
		if section_id is not None:
			if not isinstance(section_id, int) or not trip.sections.filter(id=section_id).exists():
				return Response({"section": ["Pick a section of this trip."]}, status=status.HTTP_400_BAD_REQUEST)
			items = with_same_items(trip, items.filter(section_id=section_id))
		items.update(packed=False)
		return Response(status=status.HTTP_204_NO_CONTENT)

	@action(detail=True, methods=["post"])
	def duplicate(self, request, pk=None):
		trip = self.get_object()
		# Same rules as creating a trip, except the name defaults to the next free "Copy of …".
		data = {"name": sync.copy_name(trip), **request.data}
		details = TripDetailSerializer(data=data, context={"request": request})
		details.is_valid(raise_exception=True)
		with saving_trip_name(details.validated_data["name"]):
			copy = sync.duplicate_trip(trip, **details.validated_data)
		return Response(TripDetailSerializer(copy, context={"request": request}).data, status=status.HTTP_201_CREATED)


class TripSectionViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = TripSectionSerializer

	def get_queryset(self):
		return (
			TripSection.objects.filter(trip__user=self.request.user)
			.select_related("saved_list")
			.prefetch_related("items__source_item")
		)

	def perform_create(self, serializer):
		trip = serializer.validated_data["trip"]
		saved_list = serializer.validated_data.get("saved_list")
		try:
			with transaction.atomic():
				section = serializer.save(order=next_order(trip.sections.all()))
				if saved_list is not None:
					copy_list_items(section, saved_list)
		except IntegrityError:
			# Two adds of the same list racing past validate(), e.g. a double click.
			raise serializers.ValidationError({"saved_list": ["This list is already on this trip."]}) from None


class TripItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = TripItemSerializer

	def get_queryset(self):
		items = TripItem.objects.filter(section__trip__user=self.request.user)
		return items if self.action == "restore" else items.filter(removed=False)

	def perform_create(self, serializer):
		section = serializer.validated_data["section"]
		serializer.save(order=next_order(section.items.all()))

	@transaction.atomic
	def perform_update(self, serializer):
		item = serializer.save()
		if "packed" in serializer.validated_data:
			with_same_items(item.section.trip, TripItem.objects.filter(pk=item.pk)).update(packed=item.packed)

	def perform_destroy(self, item):
		if item.from_list:
			# Keep the row as a tombstone, so list sync doesn't add the item back.
			item.removed = True
			item.save(update_fields=["removed"])
		else:
			item.delete()

	@action(detail=True, methods=["post"])
	def move(self, request, pk=None):
		"""Extras only: synced items keep their list's order, ahead of the extras."""
		item = self.get_object()
		if item.from_list:
			raise serializers.ValidationError(
				{"direction": ["This item follows its saved list's order. Move it there."]}
			)
		with transaction.atomic():
			move_one_step(item, item.section.items.filter(from_list=False), request.data.get("direction"))
			sync.renumber(item.section)
		return Response(status=status.HTTP_204_NO_CONTENT)

	@action(detail=True, methods=["post"], url_path="follow-list")
	def follow_list(self, request, pk=None):
		"""Drop the trip's own amount: take the list's, and follow its changes again."""
		item = self.get_object()
		if item.source_item is None:
			return Response({"detail": "This item isn't on a saved list."}, status=status.HTTP_400_BAD_REQUEST)
		amount = item.source_item.quantity
		if sync.amount_went_up(item.quantity, amount):
			item.packed = False
		item.quantity, item.quantity_overridden = amount, False
		item.save(update_fields=["quantity", "quantity_overridden", "packed"])
		return Response(self.get_serializer(item).data)

	@action(detail=True, methods=["post"])
	def restore(self, request, pk=None):
		item = self.get_object()
		if item.removed:
			item.removed, item.packed = False, False
			item.save(update_fields=["removed", "packed"])
		return Response(self.get_serializer(item).data)
