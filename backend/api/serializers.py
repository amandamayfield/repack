from rest_framework import serializers
from .models import Category, SavedList, SavedListItem

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