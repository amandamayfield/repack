from django.db import models

# Create your models here.
from django.conf import settings
from django.db import models

class Category(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories")
	name = models.CharField(max_length=100)
	order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["order", "id"]

	def __str__(self):
		return self.name