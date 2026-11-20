from rest_framework import serializers

from . import sync
from .models import SavedList, SavedListItem, Trip, TripItem, TripSection


class SavedListItemSerializer(serializers.ModelSerializer):
	class Meta:
		model = SavedListItem
		fields = ["id", "saved_list", "name", "quantity", "order"]

	def validate_saved_list(self, value):
		# Prevent attaching an item to a list you don't own.
		if value.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your list.")
		# Trips sync from the item's list, so moving it would leave them linked to the wrong one.
		if self.instance is not None and value != self.instance.saved_list:
			raise serializers.ValidationError("Items can't be moved to another list.")
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
	is_synced = serializers.BooleanField(source="from_list", read_only=True)
	# For "Use the list's amount": whether the trip set its own amount, and what the list says.
	can_follow_list = serializers.SerializerMethodField()
	list_quantity = serializers.SerializerMethodField()

	class Meta:
		model = TripItem
		fields = [
			"id",
			"section",
			"name",
			"quantity",
			"packed",
			"is_synced",
			"can_follow_list",
			"list_quantity",
			"order",
		]

	def get_can_follow_list(self, item):
		return item.quantity_overridden and item.source_item is not None

	def get_list_quantity(self, item):
		return item.source_item.quantity if item.source_item else None

	def validate_section(self, value):
		if value.trip.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your trip.")
		return value

	def validate(self, attrs):
		item = self.instance
		if item is None:
			return attrs
		if "section" in attrs and attrs["section"] != item.section:
			raise serializers.ValidationError({"section": "Items can't be moved between sections."})
		# Compare with the stored values, so an edit form that sends the whole item back still works.
		if item.from_list:
			if "name" in attrs and attrs["name"] != item.name:
				raise serializers.ValidationError({"name": "Rename this item on its saved list."})
			if "quantity" in attrs and attrs["quantity"] != item.quantity:
				# Typing the list's own amount back means following the list again.
				source = item.source_item
				attrs["quantity_overridden"] = source is None or attrs["quantity"] != source.quantity
		return attrs


class TripSectionSerializer(serializers.ModelSerializer):
	# Written as the trip's own name for the section; read back as what the trip shows.
	name = serializers.CharField(source="custom_name", required=False, allow_blank=True, max_length=150)
	is_synced = serializers.SerializerMethodField()
	items = serializers.SerializerMethodField()
	removed_items = serializers.SerializerMethodField()

	class Meta:
		model = TripSection
		fields = ["id", "trip", "saved_list", "name", "is_synced", "order", "items", "removed_items"]
		read_only_fields = ["order"]
		# The trip/list uniqueness check is done in validate() with a friendlier message.
		validators = []

	def get_is_synced(self, section):
		return section.saved_list_id is not None

	def get_items(self, section):
		# Filtered in Python so a prefetch of all items is reused.
		live = [i for i in section.items.all() if not i.removed]
		return TripItemSerializer(live, many=True, context=self.context).data

	def get_removed_items(self, section):
		return [{"id": i.id, "name": i.name} for i in section.items.all() if i.removed]

	def to_representation(self, section):
		data = super().to_representation(section)
		data["name"] = section.display_name
		return data

	def validate_trip(self, value):
		if value.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your trip.")
		return value

	def validate_saved_list(self, value):
		if value is not None and value.user_id != self.context["request"].user.id:
			raise serializers.ValidationError("Not your list.")
		return value

	def validate(self, attrs):
		if self.instance is not None:
			for field in ("trip", "saved_list"):
				if field in attrs and attrs[field] != getattr(self.instance, field):
					raise serializers.ValidationError({field: "A section can't be moved."})
		attrs["custom_name"] = attrs.get("custom_name", getattr(self.instance, "custom_name", "")).strip()
		trip = attrs.get("trip", getattr(self.instance, "trip", None))
		saved_list = attrs.get("saved_list", getattr(self.instance, "saved_list", None))
		if saved_list is None and not attrs["custom_name"]:
			raise serializers.ValidationError({"name": "A section needs a name."})
		if self.instance is None and saved_list is not None and trip.sections.filter(saved_list=saved_list).exists():
			raise serializers.ValidationError({"saved_list": "This list is already on this trip."})
		return attrs


class TripListSerializer(serializers.ModelSerializer):
	packed_count = serializers.IntegerField(read_only=True)
	total_count = serializers.IntegerField(read_only=True)

	class Meta:
		model = Trip
		fields = ["id", "name", "start_date", "end_date", "packed_count", "total_count", "created_at", "updated_at"]


def trip_name_taken(name):
	return f'You already have a trip called "{name}". Trip names can\'t match, so pick another.'


class TripDetailSerializer(serializers.ModelSerializer):
	sections = TripSectionSerializer(many=True, read_only=True)
	# What Duplicate offers as the copy's name.
	copy_name = serializers.SerializerMethodField()

	class Meta:
		model = Trip
		fields = ["id", "name", "start_date", "end_date", "sections", "copy_name", "created_at", "updated_at"]

	def get_copy_name(self, trip):
		return sync.copy_name(trip)

	def validate_name(self, value):
		clashes = Trip.objects.filter(user=self.context["request"].user, name__iexact=value)
		if self.instance is not None:
			clashes = clashes.exclude(pk=self.instance.pk)
		if clashes.exists():
			raise serializers.ValidationError(trip_name_taken(value))
		return value

	def validate(self, attrs):
		# On PATCH only one date may be sent; compare against the stored other one.
		start = attrs.get("start_date", getattr(self.instance, "start_date", None))
		end = attrs.get("end_date", getattr(self.instance, "end_date", None))
		if end < start:
			raise serializers.ValidationError({"end_date": "End date can't be before the start date."})
		return attrs
