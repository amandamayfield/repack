from rest_framework import serializers
from .models import Category, SavedList, SavedListItem, Trip, TripItem

class CategorySerializer(serializers.ModelSerializer):
	class Meta:
		model = Category
		fields = ["id", "name", "order"]


class OwnedCategoryMixin:
	"""Limit the `category` choices to the current user's categories, so an
	item can't point at someone else's row (it 400s as 'does not exist')."""

	def get_fields(self):
		fields = super().get_fields()
		request = self.context.get("request")
		if request is not None:
			fields["category"].queryset = Category.objects.filter(user=request.user)
		return fields


class SavedListItemSerializer(OwnedCategoryMixin, serializers.ModelSerializer):
	class Meta:
		model = SavedListItem
		fields = ["id", "saved_list", "category", "name", "quantity", "order"]

	def validate_saved_list(self, value):
	# Prevent attaching an item to a list you don't own.
		if value.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your list.")
		return value

  
class SavedListSerializer(serializers.ModelSerializer):
	items = SavedListItemSerializer(many=True, read_only=True)

	class Meta:
		model = SavedList
		fields = ["id", "name", "description", "items", "created_at", "updated_at"]


class TripItemSerializer(OwnedCategoryMixin, serializers.ModelSerializer):
	class Meta:
		model = TripItem
		fields = ["id", "trip", "category", "name", "quantity", "packed", "order"]

	def validate_trip(self, value):
		if value.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your trip.")
		return value
 

class TripListSerializer(serializers.ModelSerializer):
	packed_count = serializers.IntegerField(read_only=True)
	total_count = serializers.IntegerField(read_only=True)

	class Meta:
		model = Trip
		fields = ["id", "name", "days", "start_date", "end_date", "packed_count", "total_count", "created_at", "updated_at"]

  
class TripDetailSerializer(serializers.ModelSerializer):
	items = TripItemSerializer(many=True, read_only=True)

	class Meta:
		model = Trip
		fields = ["id", "name", "days", "start_date", "end_date", "items", "created_at", "updated_at"]

	def validate(self, attrs):
		# On PATCH only one date may be sent; compare against the stored other one.
		start = attrs.get("start_date", getattr(self.instance, "start_date", None))
		end = attrs.get("end_date", getattr(self.instance, "end_date", None))
		if start and end and end < start:
			raise serializers.ValidationError({"end_date": "End date can't be before the start date."})
		return attrs