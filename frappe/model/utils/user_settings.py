# Settings saved per user basis
# such as page_limit, filters, last_view

import json
import uuid

import frappe
from frappe import safe_decode

# dict for mapping the index and index type for the filters of different views
filter_dict = {"doctype": 0, "docfield": 1, "operator": 2, "value": 3}


def get_user_settings(doctype, for_update=False):
	user_settings = frappe.cache.hget("_user_settings", f"{doctype}::{frappe.session.user}")

	if user_settings is None:
		user_settings = frappe.db.sql(
			"""select data from `__UserSettings`
			where `user`=%s and `doctype`=%s""",
			(frappe.session.user, doctype),
		)
		user_settings = (user_settings and user_settings[0][0]) or "{}"

		if not for_update:
			update_user_settings(doctype, user_settings, True)

	return user_settings or "{}"


def update_user_settings(doctype, user_settings, for_update=False):
	"""update user settings in cache"""

	if for_update:
		current = json.loads(user_settings)
	else:
		current = json.loads(get_user_settings(doctype, for_update=True))

		if isinstance(current, str):
			# corrupt due to old code, remove this in a future release
			current = {}

		current.update(user_settings)
	frappe.cache.hset("_user_settings", f"{doctype}::{frappe.session.user}", json.dumps(current))


def sync_user_settings():
	"""Sync from cache to database (called asynchronously via the browser)"""
	for key, data in frappe.cache.hgetall("_user_settings").items():
		key = safe_decode(key)
		doctype, user = key.split("::")  # WTF?
		_upsert_user_settings_row(user, doctype, data)


def _upsert_user_settings_row(user, doctype, data):
	max_attempts = 3
	for attempt in range(1, max_attempts + 1):
		savepoint_name = f"user_settings_upsert_{uuid.uuid4().hex[:8]}"
		frappe.db.savepoint(savepoint_name)
		try:
			frappe.db.multisql(
				{
					"mariadb": """INSERT INTO `__UserSettings`(`user`, `doctype`, `data`)
					VALUES (%s, %s, %s)
					ON DUPLICATE key UPDATE `data`=%s""",
					"*": """INSERT INTO `__UserSettings` (`user`, `doctype`, `data`)
					VALUES (%s, %s, %s)
					ON CONFLICT (`user`, `doctype`) DO UPDATE SET `data`=%s""",
				},
				(user, doctype, data, data),
				as_dict=1,
			)
			frappe.db.release_savepoint(savepoint_name)
			return
		except Exception as exc:
			frappe.db.rollback(save_point=savepoint_name)
			if attempt < max_attempts and _is_retryable_serialization_error(exc):
				continue
			raise


def _is_retryable_serialization_error(exc):
	message = str(exc).lower()
	pg_code = getattr(exc, "pgcode", None)
	return pg_code == "40001" or "serialization" in message or "concorrente" in message


@frappe.whitelist()
def save(doctype: str, user_settings: str):
	user_settings = json.loads(user_settings or "{}")
	update_user_settings(doctype, user_settings)

	# Persist immediately so user preferences survive cache eviction/restarts.
	persisted_settings = get_user_settings(doctype, for_update=True)
	try:
		_upsert_user_settings_row(frappe.session.user, doctype, persisted_settings)
	except Exception:
		# Keep request successful: settings are already in cache and can be synced later.
		frappe.logger("user_settings").warning(
			"Failed to persist user settings to __UserSettings",
			exc_info=True,
		)
	return user_settings


@frappe.whitelist()
def get(doctype: str):
	return get_user_settings(doctype)


def update_user_settings_data(
	user_setting, fieldname, old, new, condition_fieldname=None, condition_values=None
):
	data = user_setting.get("data")
	if data:
		update = False
		data = json.loads(data)
		for view in ["List", "Gantt", "Kanban", "Calendar", "Image", "Inbox", "Report"]:
			view_settings = data.get(view)
			if view_settings and view_settings.get("filters"):
				view_filters = view_settings.get("filters")
				for view_filter in view_filters:
					if (
						condition_fieldname
						and view_filter[filter_dict[condition_fieldname]] != condition_values
					):
						continue
					if view_filter[filter_dict[fieldname]] == old:
						view_filter[filter_dict[fieldname]] = new
						update = True
		if update:
			frappe.db.sql(
				"update __UserSettings set data=%s where doctype=%s and user=%s",
				(json.dumps(data), user_setting.doctype, user_setting.user),
			)

			# clear that user settings from the redis cache
			frappe.cache.hset("_user_settings", f"{user_setting.doctype}::{user_setting.user}", None)
