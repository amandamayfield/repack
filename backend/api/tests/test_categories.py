import pytest


@pytest.mark.django_db
def test_create_and_list_category(client_for):
	c, _ = client_for("amanda")
	r = c.post("/api/categories/", {"name": "Toiletries", "order": 0}, format="json")
	assert r.status_code == 201
	assert c.get("/api/categories/").data[0]["name"] == "Toiletries"


@pytest.mark.django_db
def test_user_cannot_see_others_categories(client_for):
	amanda, _ = client_for("amanda")
	amanda.post("/api/categories/", {"name": "Amanda Cat", "order": 0}, format="json")
	adam, _ = client_for("adam")
	assert adam.get("/api/categories/").data == []


@pytest.mark.django_db
def test_user_cannot_fetch_others_category_by_id(client_for):
	amanda, _ = client_for("amanda")
	cid = amanda.post("/api/categories/", {"name": "Amanda Cat", "order": 0}, format="json").data["id"]
	adam, _ = client_for("adam")
	assert adam.get(f"/api/categories/{cid}/").status_code == 404


@pytest.mark.django_db
def test_new_categories_are_appended_in_creation_order(client_for):
	c, _ = client_for("amanda")
	for name in ("Clothes", "Gear", "Toiletries"):
		c.post("/api/categories/", {"name": name}, format="json")
	rows = c.get("/api/categories/").data
	assert [r["name"] for r in rows] == ["Clothes", "Gear", "Toiletries"]
	assert [r["order"] for r in rows] == [0, 1, 2]
