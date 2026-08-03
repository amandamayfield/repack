from django.contrib import admin
from django.views.generic import TemplateView
from django.urls import include, path, re_path


urlpatterns = [
	path("admin/", admin.site.urls),
	path("api/", include("api.urls")),
	# Anything NOT starting with api/ returns the React index.html:
	re_path(r"^(?!api/).*$", TemplateView.as_view(template_name="index.html")),
]
