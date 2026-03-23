# Copyright (c) 2020, Frappe Technologies and contributors
# License: MIT. See LICENSE

import frappe
from frappe.model.document import Document
from frappe.utils import cint


LIST_VIEW_MIN_COLUMN_WIDTH = 90
LIST_VIEW_MAX_COLUMN_WIDTH = 2000


class ListViewSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allow_edit: DF.Check
		disable_auto_refresh: DF.Check
		disable_automatic_recency_filters: DF.Check
		disable_comment_count: DF.Check
		disable_count: DF.Check
		disable_scrolling: DF.Check
		disable_sidebar_stats: DF.Check
		fields: DF.Code | None
		show_tags: DF.Check
		column_widths: DF.Code | None
	# end: auto-generated types

	pass


@frappe.whitelist()
def save_listview_settings(doctype, listview_settings, removed_listview_fields):
	listview_settings = frappe.parse_json(listview_settings)
	removed_listview_fields = frappe.parse_json(removed_listview_fields)

	if frappe.get_all("List View Settings", filters={"name": doctype}):
		doc = frappe.get_doc("List View Settings", doctype)
		doc.update(listview_settings)
		doc.save()
	else:
		doc = frappe.new_doc("List View Settings")
		doc.name = doctype
		doc.update(listview_settings)
		doc.insert()

	set_listview_fields(doctype, listview_settings.get("fields"), removed_listview_fields)

	return {"meta": frappe.get_meta(doctype, False), "listview_settings": doc}


def set_listview_fields(doctype, listview_fields, removed_listview_fields):
	meta = frappe.get_meta(doctype)

	listview_fields = [f.get("fieldname") for f in frappe.parse_json(listview_fields) if f.get("fieldname")]

	for field in removed_listview_fields:
		set_in_list_view_property(doctype, meta.get_field(field), "0")

	for field in listview_fields:
		set_in_list_view_property(doctype, meta.get_field(field), "1")


def set_in_list_view_property(doctype, field, value):
	if not field or field.fieldname == "status_field":
		return

	property_setter = frappe.db.get_value(
		"Property Setter",
		{"doc_type": doctype, "field_name": field.fieldname, "property": "in_list_view"},
	)
	if property_setter:
		doc = frappe.get_doc("Property Setter", property_setter)
		doc.value = value
		doc.save()
	else:
		frappe.make_property_setter(
			{
				"doctype": doctype,
				"doctype_or_field": "DocField",
				"fieldname": field.fieldname,
				"property": "in_list_view",
				"value": value,
				"property_type": "Check",
			},
			ignore_validate=True,
		)


def _normalize_listview_column_width(width):
	if width is None:
		frappe.throw(frappe._("Width is required"))

	width_string = str(width).strip().lower()
	if width_string.endswith("px"):
		width_string = width_string[:-2].strip()

	if not width_string.isdigit():
		frappe.throw(frappe._("Width must be a valid number of pixels"))

	return min(LIST_VIEW_MAX_COLUMN_WIDTH, max(LIST_VIEW_MIN_COLUMN_WIDTH, cint(width_string)))


@frappe.whitelist()
def save_listview_column_width(doctype, fieldname, width):
	frappe.only_for("System Manager")

	if not doctype:
		frappe.throw(frappe._("DocType is required"))
	if not fieldname:
		frappe.throw(frappe._("Field is required"))

	frappe.has_permission(doctype, ptype="read", throw=True)
	width = _normalize_listview_column_width(width)

	meta = frappe.get_meta(doctype)
	# "name" is an implicit field (primary key) not stored in meta.fields
	field = meta.get_field(fieldname)
	if not field and fieldname != "name":
		frappe.throw(frappe._("Field not found"))

	if fieldname == "name":
		# Keep both stores in sync for the implicit PK field.
		_save_column_width_via_property_setter(doctype, fieldname, width)
		naming_fieldname = _get_autoname_fieldname(meta)
		if naming_fieldname and meta.get_field(naming_fieldname):
			# Mirror width to the source field when naming is based on `field:...`.
			_save_column_width_via_property_setter(doctype, naming_fieldname, width)
		_save_column_width_in_listview_settings(doctype, fieldname, width)
	elif field:
		# Regular field: use Property Setter (reflected in meta.fields on reload)
		_save_column_width_via_property_setter(doctype, fieldname, width)
	else:
		# Implicit field fallback: persist in List View Settings.column_widths.
		_save_column_width_in_listview_settings(doctype, fieldname, width)

	frappe.clear_document_cache("List View Settings", doctype)
	frappe.clear_cache(doctype=doctype)
	return {"fieldname": fieldname, "width": f"{width}px"}


def _get_autoname_fieldname(meta):
	autoname = (meta.autoname or "").strip()
	if autoname.lower().startswith("field:"):
		candidate = autoname.split(":", 1)[1].strip()
		return candidate or None

	return None


def _save_column_width_via_property_setter(doctype, fieldname, width):
	property_setter = frappe.db.get_value(
		"Property Setter",
		{"doc_type": doctype, "field_name": fieldname, "property": "width"},
	)
	if property_setter:
		doc = frappe.get_doc("Property Setter", property_setter)
		doc.value = f"{width}px"
		doc.save()
	else:
		frappe.make_property_setter(
			{
				"doctype": doctype,
				"doctype_or_field": "DocField",
				"fieldname": fieldname,
				"property": "width",
				"value": f"{width}px",
				"property_type": "Data",
			},
			ignore_validate=True,
		)


def _save_column_width_in_listview_settings(doctype, fieldname, width):
	if frappe.get_all("List View Settings", filters={"name": doctype}):
		settings_doc = frappe.get_doc("List View Settings", doctype)
	else:
		settings_doc = frappe.new_doc("List View Settings")
		settings_doc.name = doctype

	column_widths = frappe.parse_json(settings_doc.get("column_widths") or "{}")
	column_widths[fieldname] = f"{width}px"
	settings_doc.column_widths = frappe.as_json(column_widths)
	settings_doc.save(ignore_permissions=True)


@frappe.whitelist()
def get_default_listview_fields(doctype):
	meta = frappe.get_meta(doctype)
	path = frappe.get_module_path(
		frappe.scrub(meta.module), "doctype", frappe.scrub(meta.name), frappe.scrub(meta.name) + ".json"
	)
	doctype_json = frappe.get_file_json(path)

	fields = [f.get("fieldname") for f in doctype_json.get("fields") if f.get("in_list_view")]

	if meta.title_field:
		if meta.title_field.strip() not in fields:
			fields.append(meta.title_field.strip())

	return fields
