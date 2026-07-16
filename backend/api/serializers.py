from rest_framework import serializers
from .models import Category, SavedList, SavedListItem, Trip, TripItem

class CategorySerializer(serializers.ModelSerializer):
	class Meta:
		model = Category
		fields = ["id", "name", "order"]


class SavedListItemSerializer(serializers.ModelSerializer):
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


class TripItemSerializer(serializers.ModelSerializer):
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