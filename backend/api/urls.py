from django.urls import path
from . import views_auth
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, SavedListViewSet, SavedListItemViewSet, TripViewSet, TripItemViewSet

urlpatterns = [
	path("auth/register/", views_auth.register),
	path("auth/login/", views_auth.login_view),
	path("auth/logout/", views_auth.logout_view),
	path("auth/me/", views_auth.me),
]

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("saved-lists", SavedListViewSet, basename="savedlist")
router.register("saved-list-items", SavedListItemViewSet, basename="savedlistitem")
router.register("trips", TripViewSet, basename="trip")
router.register("trip-items", TripItemViewSet, basename="tripitem")

urlpatterns += router.urls