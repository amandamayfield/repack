from django.contrib import admin
from django.views.generic import TemplateView
from django.urls import include, path, re_path


urlpatterns = [
	path("admin/", admin.site.urls),
	path("api/", include("api.urls")),
	# Anything NOT starting with api/ or static/ returns the React index.html.
	# Excluding static/ makes a missing asset a 404 instead of HTML served as JS.
	re_path(r"^(?!api/|static/).*$", TemplateView.as_view(template_name="index.html")),
]
