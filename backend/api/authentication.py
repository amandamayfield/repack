# Kept apart from api/auth.py: settings load this class while DRF's views are
# still importing, so it must not import anything that imports rest_framework.views.
from rest_framework.authentication import SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
	"""Session auth that answers anonymous requests with 401 instead of 403.
	DRF only sends 401 when the auth class provides a WWW-Authenticate value;
	stock SessionAuthentication doesn't, so "not logged in" and "CSRF failed"
	both came back as 403. CSRF and permission failures stay 403."""

	def authenticate_header(self, request):
		return "Session"
