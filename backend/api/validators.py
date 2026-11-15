"""Password validators with friendlier messages than Django's defaults."""

from django.contrib.auth.password_validation import CommonPasswordValidator
from django.core.exceptions import ValidationError

COMMON_PASSWORD_MESSAGE = (
	"This password is on a list of commonly used passwords that are easy to guess. "
	"Try a longer phrase made of a few unrelated words."
)


class FriendlyCommonPasswordValidator(CommonPasswordValidator):
	"""Same check as Django's, but the error says what "common" means and what to do instead."""

	def validate(self, password, user=None):
		try:
			super().validate(password, user)
		except ValidationError:
			raise ValidationError(COMMON_PASSWORD_MESSAGE, code="password_too_common") from None

	def get_help_text(self):
		return "Your password can't be a commonly used password."
