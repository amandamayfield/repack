from rest_framework import serializers

from .models import SavedList, SavedListItem, Trip, TripItem


class SavedListItemSerializer(serializers.ModelSerializer):
	class Meta:
		model = SavedListItem
		fields = ["id", "saved_list", "name", "quantity", "order"]

	def validate_saved_list(self, value):
		# Prevent attaching an item to a list you don't own.
		if value.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your list.")
		return value


class SavedListSummarySerializer(serializers.ModelSerializer):
	"""For the list endpoint: pages and pickers only need names, not every item."""

	class Meta:
		model = SavedList
		fields = ["id", "name", "description", "created_at", "updated_at"]


class SavedListSerializer(serializers.ModelSerializer):
	items = SavedListItemSerializer(many=True, read_only=True)

	class Meta:
		model = SavedList
		fields = ["id", "name", "description", "items", "created_at", "updated_at"]


class TripItemSerializer(serializers.ModelSerializer):
	class Meta:
		model = TripItem
		fields = ["id", "section", "name", "quantity", "packed", "order"]

	def validate_section(self, value):
		if value.trip.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your trip.")
		return value


class TripListSerializer(serializers.ModelSerializer):
	packed_count = serializers.IntegerField(read_only=True)
	total_count = serializers.IntegerField(read_only=True)

	class Meta:
		model = Trip
		fields = ["id", "name", "start_date", "end_date", "packed_count", "total_count", "created_at", "updated_at"]


class TripDetailSerializer(serializers.ModelSerializer):
	class Meta:
		model = Trip
		fields = ["id", "name", "start_date", "end_date", "created_at", "updated_at"]

	def validate(self, attrs):
		# On PATCH only one date may be sent; compare against the stored other one.
		start = attrs.get("start_date", getattr(self.instance, "start_date", None))
		end = attrs.get("end_date", getattr(self.instance, "end_date", None))
		if start and end and end < start:
			raise serializers.ValidationError({"end_date": "End date can't be before the start date."})
		return attrs
