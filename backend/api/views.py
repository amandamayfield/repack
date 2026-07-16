from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q

from .permissions import IsOwner
from .models import Category, SavedList, SavedListItem, Trip, TripItem
from .serializers import CategorySerializer, SavedListSerializer, SavedListItemSerializer, TripListSerializer, TripItemSerializer, TripDetailSerializer

class OwnedModelViewSet(viewsets.ModelViewSet):
	"""Base class: scope every query to the current user, and stamp
	the current user as owner whenever something is created."""
	permission_classes = [IsAuthenticated, IsOwner]

	def get_queryset(self):
		return self.queryset.filter(user=self.request.user)

	def perform_create(self, serializer):
		serializer.save(user=self.request.user)
		

class CategoryViewSet(OwnedModelViewSet):
	queryset = Category.objects.all()
	serializer_class = CategorySerializer


class SavedListViewSet(OwnedModelViewSet):
	queryset = SavedList.objects.all()
	serializer_class = SavedListSerializer

  
class SavedListItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = SavedListItemSerializer

	def get_queryset(self):
	# Items are owned indirectly, through their parent list's user.
		return SavedListItem.objects.filter(saved_list__user=self.request.user)
	

class TripViewSet(OwnedModelViewSet):
	queryset = Trip.objects.all()

	def get_serializer_class(self):
	# Use the lightweight serializer for the list, the full one otherwise.
		return TripListSerializer if self.action == "list" else TripDetailSerializer

	def get_queryset(self):
		qs = super().get_queryset() # already filtered to request.user
		if self.action == "list":
			qs = qs.annotate(
				total_count=Count("items", distinct=True),
				packed_count=Count("items", filter=Q(items__packed=True), distinct=True),
)
		return qs

  
class TripItemViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	serializer_class = TripItemSerializer

	def get_queryset(self):
		return TripItem.objects.filter(trip__user=self.request.user)