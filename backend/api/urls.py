from django.urls import path
from . import views_auth
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet

urlpatterns = [
	path("auth/register/", views_auth.register),
	path("auth/login/", views_auth.login_view),
	path("auth/logout/", views_auth.logout_view),
	path("auth/me/", views_auth.me),
]

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")

urlpatterns += router.urls