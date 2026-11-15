from django.contrib.auth import password_validation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

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