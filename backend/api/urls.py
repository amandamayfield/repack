from django.urls import path
from . import auth
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, SavedListViewSet, SavedListItemViewSet, TripViewSet, TripItemViewSet

urlpatterns = [
	path("auth/register/", auth.register),
	path("auth/login/", auth.login_view),
	path("auth/logout/", auth.logout_view),
	path("auth/me/", auth.me),
	path("auth/csrf/", auth.csrf),
]

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("saved-lists", SavedListViewSet, basename="savedlist")
router.register("saved-list-items", SavedListItemViewSet, basename="savedlistitem")
router.register("trips", TripViewSet, basename="trip")
router.register("trip-items", TripItemViewSet, basename="tripitem")

urlpatterns += router.urls
