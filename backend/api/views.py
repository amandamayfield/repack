from django.db.models import Count, Max, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import SavedList, SavedListItem, Trip, TripItem
from .permissions import IsOwner
from .serializers import (
	SavedListItemSerializer,
	SavedListSerializer,
	SavedListSummarySerializer,
	TripDetailSerializer,
	TripItemSerializer,
	TripListSerializer,
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


class SavedListItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = SavedListItemSerializer

	def get_queryset(self):
		# Items are owned indirectly, through their parent list's user.
		return SavedListItem.objects.filter(saved_list__user=self.request.user)

	def perform_create(self, serializer):
		# The server owns ordering on create, so deletes can't cause collisions.
		saved_list = serializer.validated_data["saved_list"]
		serializer.save(order=next_order(saved_list.items.all()))


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
		return qs

	@action(detail=True, methods=["post"])
	def duplicate(self, request, pk=None):
		trip = self.get_object()
		copy = Trip.objects.create(user=request.user, name=f"Copy of {trip.name}"[:150])
		return Response(TripDetailSerializer(copy, context={"request": request}).data, status=status.HTTP_201_CREATED)


class TripItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = TripItemSerializer

	def get_queryset(self):
		return TripItem.objects.filter(section__trip__user=self.request.user)

	def perform_create(self, serializer):
		section = serializer.validated_data["section"]
		serializer.save(order=next_order(section.items.all()))
