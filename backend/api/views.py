from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .permissions import IsOwner
from .models import Category
from .serializers import CategorySerializer

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