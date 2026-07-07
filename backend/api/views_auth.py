from django.contrib.auth import authenticate, login, logout
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .serializers_auth import UserSerializer

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
	s = UserSerializer(data=request.data)
	s.is_valid(raise_exception=True)
	user = s.save()
	return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
	user = authenticate(
		username=request.data.get("username"),
		password=request.data.get("password"),
	)
	if user is None:
		return Response({"detail": "Invalid credentials"}, status=400)
	login(request, user)
	return Response(UserSerializer(user).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
	logout(request)
	return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
	return Response(UserSerializer(request.user).data)