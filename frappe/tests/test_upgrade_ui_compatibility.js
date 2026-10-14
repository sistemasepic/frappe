const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const public_js = path.resolve(__dirname, "../public/js/frappe");

function load_ui() {
	const saves = [];
	const alerts = [];
	const settings = {
		Parent: {
			GridView: {
				Child: [{ fieldname: "code", columns: 2, width_px: 240, sticky: 1 }],
				OtherChild: [{ fieldname: "other", width: 180 }],
			},
			GridViewColumnWidthsPx: { items: { code: 320 } },
		},
	};
	const frappe = {
		provide() {},
		ui: { form: { ControlLink: class {} } },
		views: { BaseList: class {} },
		model: {
			user_settings: Object.assign(settings, {
				async save(doctype, key, value) {
					saves.push({ doctype, key, value });
					settings[doctype][key] = value;
					return { message: settings[doctype] };
				},
			}),
		},
		get_user_settings: (doctype, key) => settings[doctype]?.[key],
		parse_json: JSON.parse,
		meta: { get_docfield: () => null },
		utils: { is_empty: (value) => value === "" || value == null },
		show_alert: (alert) => alerts.push(alert),
	};
	const context = vm.createContext({
		frappe,
		console,
		cint: (value) => Number.parseInt(value, 10) || 0,
		cstr: (value) => (value == null ? "" : String(value)),
		__: (value) => value,
		$: {
			extend: (_deep, target, source) =>
				Object.assign(target, JSON.parse(JSON.stringify(source))),
			isPlainObject: (value) =>
				value != null && typeof value === "object" && !Array.isArray(value),
		},
	});
	for (const [filename, class_name] of [
		["form/grid.js", "Grid"],
		["form/grid_row.js", "GridRow"],
		["list/list_view.js", null],
		["form/controls/table_multiselect.js", null],
	]) {
		let source = fs
			.readFileSync(path.join(public_js, filename), "utf8")
			.replace(/^import .*;\n/gm, "")
			.replace(/^export const /gm, "const ");
		if (class_name) {
			source = source.replace(`export default class ${class_name}`, `class ${class_name}`);
			source += `\nglobalThis.${class_name} = ${class_name};`;
		}
		vm.runInContext(source, context, { filename });
	}
	const grid = Object.assign(Object.create(context.Grid.prototype), {
		frm: { doctype: "Parent" },
		df: { fieldname: "items" },
		doctype: "Child",
		docfields: [{ fieldname: "code", fieldtype: "Link", columns: 2 }],
	});
	const list = Object.assign(Object.create(frappe.views.ListView.prototype), {
		min_column_width: 90,
		max_column_width: 2000,
		column_width_overrides: {},
		columns: [{ type: "Field", df: { fieldname: "code", width: 210 } }],
		user_settings: { List: {} },
	});
	return { context, frappe, grid, list, saves, alerts };
}

test("grid migrates custom pixel widths without losing native or legacy settings", () => {
	const { grid, frappe } = load_ui();
	grid.setup_user_defined_columns();
	assert.equal(grid.user_defined_columns[0].width, 320);
	assert.equal(grid.user_defined_columns[0].sticky, 1);
	assert.equal(grid.docfields[0].width, undefined);
	delete frappe.model.user_settings.Parent.GridViewColumnWidthsPx.items.code;
	grid.setup_user_defined_columns();
	assert.equal(grid.user_defined_columns[0].width, 240);
	frappe.model.user_settings.Parent.GridView.Child[0].width = 400;
	grid.setup_user_defined_columns();
	assert.equal(grid.user_defined_columns[0].width, 400);
	delete frappe.model.user_settings.Parent.GridView.Child[0].width;
	delete frappe.model.user_settings.Parent.GridView.Child[0].width_px;
	grid.setup_user_defined_columns();
	assert.equal(grid.user_defined_columns[0].width, 100);
});

test("grid preserves custom bounds and fieldtype defaults", () => {
	const { grid } = load_ui();
	assert.equal(grid.clamp_column_width(1), 60);
	assert.equal(grid.clamp_column_width(9999), 1200);
	assert.equal(grid.get_column_width({ fieldname: "text", fieldtype: "Text" }), 200);
	assert.equal(grid.get_column_width({ fieldname: "legacy", colsize: 4 }), 200);
});

test("column dialog writes native pixel widths and retains other child tables", async () => {
	const { context, grid, saves } = load_ui();
	let refreshes = 0;
	grid.reset_grid = () => refreshes++;
	const row = Object.assign(Object.create(context.GridRow.prototype), {
		grid,
		frm: grid.frm,
		selected_columns_for_grid: [{ fieldname: "code", width: 180, sticky: 1 }],
	});
	row.update_user_settings_for_grid();
	await new Promise(setImmediate);
	assert.equal(saves.length, 1);
	assert.equal(saves[0].key, "GridView");
	assert.equal(saves[0].value.Child[0].width, 180);
	assert.equal(saves[0].value.OtherChild[0].width, 180);
	assert.equal(refreshes, 1);
});

test("reset clears legacy grid pixel settings without affecting other tables", async () => {
	const { grid, frappe } = load_ui();
	frappe.model.user_settings.Parent.GridViewColumnWidthsPx.other = { code: 500 };
	await grid.reset_grid_col_widths_px();
	assert.equal(frappe.model.user_settings.Parent.GridViewColumnWidthsPx.items, undefined);
	assert.equal(frappe.model.user_settings.Parent.GridViewColumnWidthsPx.other.code, 500);
});

test("idle grid buttons remain visible only for editable, non-hidden Button fields", () => {
	const { context } = load_ui();
	const row = Object.assign(Object.create(context.GridRow.prototype), {
		grid: { allow_on_grid_editing: () => true, is_editable: () => true },
		doc: { name: "row-1" },
	});

	assert.equal(
		Boolean(row.should_show_button_in_idle_grid_cell({ df: { fieldtype: "Button" } })),
		true
	);
	assert.equal(
		Boolean(row.should_show_button_in_idle_grid_cell({ df: { fieldtype: "Data" } })),
		false
	);
	assert.equal(
		Boolean(
			row.should_show_button_in_idle_grid_cell({ df: { fieldtype: "Button", hidden: 1 } })
		),
		false
	);
});

test("a saved width is not stretched by the last-column fill rule", () => {
	const { context, grid } = load_ui();
	const df = { fieldname: "label", fieldtype: "Data", label: "Label", width: 180 };
	grid.visible_columns = [[df, 180]];
	grid.user_defined_columns = [];
	grid.setup_visible_columns = () => {};
	const classes = new Set();
	const column = {
		df,
		removeClass: (name) => classes.delete(name),
		addClass: (name) => classes.add(name),
	};
	const row = Object.assign(Object.create(context.GridRow.prototype), {
		grid,
		docfields: [df],
		columns: {},
		columns_list: [],
		make_column(field, width) {
			assert.equal(width, 180);
			this.columns[field.fieldname] = column;
			this.columns_list.push(column);
			return column;
		},
	});
	row.setup_columns();
	assert.equal(classes.has("grid-data-last"), false);
	delete df.width;
	row.columns = {};
	row.columns_list = [];
	row.setup_columns();
	assert.equal(classes.has("grid-data-last"), true);
});

test("list reads old status widths and respects saved-layout widths", () => {
	const { list } = load_ui();
	list.user_settings.List = { column_widths: { status_indicator: "175px" } };
	assert.equal(list._get_user_settings_column_width("status_field"), 175);
	assert.equal(list.normalize_column_width(1), 90);
	assert.equal(list.normalize_column_width(9999), 2000);
	list.user_settings.List.column_widths.code = "700px";
	list.list_filter = { active_layout_name: "saved-layout" };
	assert.equal(list._get_persisted_column_width("code"), 210);
});

test("list preserves default-layout widths from upstream settings", () => {
	const { list } = load_ui();
	list.list_filter = { active_layout_name: "default_layout" };
	assert.equal(list._get_persisted_column_width("code"), 210);
	list.list_view_settings = { column_widths: '{"status_indicator":"195px"}' };
	assert.equal(list._get_global_settings_column_width("status_field"), 195);
});

test("read-only saved layouts reject resizing and remove the session override", () => {
	const { list, alerts } = load_ui();
	let reapplied = false;
	list.column_width_overrides.code = 450;
	list.apply_column_widths = () => {
		reapplied = true;
	};
	list.list_filter = {
		active_layout_name: "shared-layout",
		get_active_layout: () => ({ name: "shared-layout" }),
		can_edit_layout: () => false,
	};
	list.save_column_width("code", 450);
	assert.equal(list.column_width_overrides.code, undefined);
	assert.equal(reapplied, true);
	assert.equal(alerts[0].indicator, "red");
});

test("saved-layout resizing updates that layout, not global or personal settings", async () => {
	const { list, saves } = load_ui();
	let updated;
	list.column_max_widths = {};
	list.list_filter = {
		active_layout_name: "saved-layout",
		get_active_layout: () => ({ name: "saved-layout" }),
		can_edit_layout: () => true,
		get_current_columns_state: () => [{ fieldname: "code", width: 210 }],
		async update_layout_columns(layout, columns, options) {
			updated = { layout, columns, options };
		},
	};
	await list.save_column_width("code", 450);
	assert.equal(updated.columns[0].width, 450);
	assert.equal(updated.options.debounce, false);
	assert.equal(list.columns[0].df.width, 450);
	assert.equal(saves.length, 0);
});

test("Table MultiSelect still treats numeric and string link keys as duplicates", async () => {
	const { frappe } = load_ui();
	const control = Object.assign(
		Object.create(frappe.ui.form.ControlTableMultiSelect.prototype),
		{
			df: { ignore_link_validation: true },
			get_link_field: () => ({ fieldname: "code" }),
		}
	);
	assert.equal((await control.validate([{ code: 123 }, { code: "123" }])).length, 1);
	assert.equal((await control.validate([{ code: 123 }, { code: "456" }])).length, 2);
	assert.equal((await control.validate([{ code: 123 }, { code: null }])).length, 1);
});
