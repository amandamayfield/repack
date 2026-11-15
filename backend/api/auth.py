"""Session auth endpoints: register, login, logout, me, and the CSRF cookie."""
from django.contrib.auth import authenticate, login, logout, password_validation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.middleware.csrf import get_token
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle


class UserSerializer(serializers.ModelSerializer):
	password = serializers.CharField(write_only=True)

	class Meta:
		model = User
		fields = ["id", "username", "password"]

	def validate(self, attrs):
		# create_user() doesn't run AUTH_PASSWORD_VALIDATORS on its own. Pass an
		# unsaved User so UserAttributeSimilarityValidator can compare the username.
		try:
			password_validation.validate_password(attrs["password"], User(username=attrs["username"]))
		except DjangoValidationError as e:
			raise serializers.ValidationError({"password": list(e.messages)})
		return attrs

	def create(self, validated_data):
		return User.objects.create_user(**validated_data)


class AuthThrottle(SimpleRateThrottle):
	"""Per-IP limit on login/register to slow password guessing and signup spam.
	Keyed by IP even for logged-in sessions, so a session can't bypass it.
	Rate: REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["auth"]."""
	scope = "auth"

	def get_cache_key(self, request, view):
		return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
	s = UserSerializer(data=request.data)
	s.is_valid(raise_exception=True)
	user = s.save()
	return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
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

@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
	get_token(request) # this call forces Django to set the csrftoken cookie
	return Response({"detail": "ok"})
