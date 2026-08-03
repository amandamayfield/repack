from django.middleware.csrf import get_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

  
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
	get_token(request) # this call forces Django to set the csrftoken cookie
	return Response({"detail": "ok"})