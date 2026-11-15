from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q
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
)


def next_order(siblings):
	"""The `order` for a new item appended after `siblings` (0 if there are none)."""
	current_max = siblings.aggregate(m=Max("order"))["m"]
	return 0 if current_max is None else current_max + 1


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

	@transaction.atomic
	def perform_update(self, serializer):
		old_name, old_quantity = serializer.instance.name, serializer.instance.quantity
		item = serializer.save()
		sync.sync_item_updated(item, old_name, old_quantity)

	@transaction.atomic
	def perform_destroy(self, item):
		sync.sync_item_deleted(item)
		item.delete()


class TripViewSet(OwnedModelViewSet):
	queryset = Trip.objects.all()

	def get_serializer_class(self):
		# Use the lightweight serializer for the list, the full one otherwise.
		return TripListSerializer if self.action == "list" else TripDetailSerializer

	def get_queryset(self):
		qs = super().get_queryset()  # already filtered to request.user
		if self.action == "list":
			live = Q(sections__items__removed=False)
			qs = qs.annotate(
				total_count=Count("sections__items", filter=live),
				packed_count=Count("sections__items", filter=live & Q(sections__items__packed=True)),
			)
		else:
			qs = qs.prefetch_related("sections__saved_list", "sections__items")
		return qs

	@transaction.atomic
	def perform_update(self, serializer):
		was_current = sync.is_current(serializer.instance)
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
		return Response(status=status.HTTP_200_OK)

	@action(detail=True, methods=["post"])
	def duplicate(self, request, pk=None):
		trip = self.get_object()
		copy = Trip.objects.create(user=request.user, name=f"Copy of {trip.name}"[:150])
		return Response(TripDetailSerializer(copy, context={"request": request}).data, status=status.HTTP_201_CREATED)


class TripSectionViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = TripSectionSerializer

	def get_queryset(self):
		return (
			TripSection.objects.filter(trip__user=self.request.user)
			.select_related("saved_list")
			.prefetch_related("items")
		)

	def perform_create(self, serializer):
		trip = serializer.validated_data["trip"]
		saved_list = serializer.validated_data.get("saved_list")
		try:
			with transaction.atomic():
				section = serializer.save(order=next_order(trip.sections.all()))
				if saved_list is not None:
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
		except IntegrityError:
			# Two adds of the same list racing past validate(), e.g. a double click.
			raise serializers.ValidationError({"saved_list": ["This list is already on this trip."]}) from None


class TripItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = TripItemSerializer

	def get_queryset(self):
		return TripItem.objects.filter(section__trip__user=self.request.user, removed=False)

	def perform_create(self, serializer):
		section = serializer.validated_data["section"]
		serializer.save(order=next_order(section.items.all()))

	def perform_destroy(self, item):
		if item.from_list:
			# Keep the row as a tombstone, so list sync doesn't add the item back.
			item.removed = True
			item.save(update_fields=["removed"])
		else:
			item.delete()
