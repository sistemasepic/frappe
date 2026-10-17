const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const public_js = path.resolve(__dirname, "../public/js/frappe");

function load_ui(initial_settings = { List: { filters: [], column_widths: {} } }) {
	const calls = [];
	const styles = [];
	const alerts = [];
	const errors = [];
	let server_settings = structuredClone(initial_settings);
	let fail_save = false;
	const $ = {
		isPlainObject: (value) =>
			value != null && typeof value === "object" && !Array.isArray(value),
		extend(...args) {
			const deep = args[0] === true;
			if (deep) args.shift();
			const target = args.shift();
			for (const source of args) {
				for (const [key, value] of Object.entries(source)) {
					target[key] =
						deep && value && typeof value === "object"
							? structuredClone(value)
							: value;
				}
			}
			return target;
		},
	};
	const frappe = {
		provide() {},
		views: { BaseList: class {} },
		model: {
			user_settings: { ProcPlanejaCompra: structuredClone(initial_settings) },
			is_numeric_field: () => false,
		},
		session: { user: "resize-test@example.invalid" },
		user_roles: ["System Manager"],
		meta: { get_docfield: () => null },
		is_mobile: () => false,
		has_indicator: () => true,
		show_alert: (alert) => alerts.push(alert),
		utils: { icon: () => "", escape_html: (value) => value },
		async call(options) {
			calls.push(options);
			await Promise.resolve();
			if (fail_save) throw new Error("Save failed");
			assert.equal(options.method, "frappe.model.utils.user_settings.save");
			server_settings = structuredClone(options.args.user_settings);
			const response = { message: structuredClone(server_settings) };
			options.callback?.(response);
			return response;
		},
	};
	const context = vm.createContext({
		frappe,
		$,
		console: { error: (error) => errors.push(error) },
		cint: (value) => Number.parseInt(value, 10) || 0,
		__: (value) => value,
		Sortable: class {},
	});
	for (const filename of [
		"model/user_settings.js",
		"list/list_view.js",
		"list/list_settings.js",
		"list/list_filter/layout_field_selector.js",
		"list/list_filter/list_filter_menu.js",
	]) {
		let source = fs
			.readFileSync(path.join(public_js, filename), "utf8")
			.replace(/^import .*;\n/gm, "");
		source = source.replace("export default class ListSettings", "class ListSettings");
		if (filename.endsWith("list_settings.js")) {
			source += "\nglobalThis.ListSettings = ListSettings;";
		}
		source = source.replace(
			"export default class LayoutFieldSelector",
			"class LayoutFieldSelector"
		);
		if (filename.endsWith("layout_field_selector.js")) {
			source += "\nglobalThis.LayoutFieldSelector = LayoutFieldSelector;";
		}
		source = source.replace("export const ListFilterMenu", "const ListFilterMenu");
		if (filename.endsWith("list_filter_menu.js")) {
			source += "\nglobalThis.ListFilterMenu = ListFilterMenu;";
		}
		vm.runInContext(source, context, { filename });
	}

	function make_list() {
		return Object.assign(Object.create(frappe.views.ListView.prototype), {
			doctype: "ProcPlanejaCompra",
			user_settings: frappe.get_user_settings("ProcPlanejaCompra"),
			min_column_width: 90,
			max_column_width: 2000,
			column_width_overrides: {},
			column_max_widths: {},
			list_view_settings: {},
			settings: {},
			meta: {},
			columns: [
				{ type: "Subject", df: { fieldname: "name", label: "ID" } },
				{ type: "Tag" },
				{ type: "Status" },
				{ type: "Field", df: { fieldname: "observacao" } },
				{ type: "Field", df: { fieldname: "desfiltrolistaprodutos" } },
			],
			$result: {
				find: (selector) => ({
					css: (style) => styles.push({ selector, style }),
				}),
			},
		});
	}
	return {
		context,
		frappe,
		list: make_list(),
		make_list,
		calls,
		styles,
		alerts,
		errors,
		fail_next_saves: (fail) => (fail_save = fail),
		reload() {
			frappe.model.user_settings.ProcPlanejaCompra = structuredClone(server_settings);
			return make_list();
		},
	};
}

for (const [fieldname, width] of [
	["name", 220],
	["status_field", 175],
	["observacao", 772],
	["desfiltrolistaprodutos", 591],
]) {
	test(`drag saves and restores ${fieldname} at exactly ${width}px`, async () => {
		const ui = load_ui();
		const original = ui.frappe.get_user_settings("ProcPlanejaCompra");
		ui.list.resize_column(fieldname, width);
		const saved = ui.list.save_column_width(fieldname, width);
		assert.equal(original.List.column_widths[fieldname], undefined);
		await saved;
		assert.equal(ui.calls.length, 1);
		assert.equal(ui.calls[0].args.user_settings.List.column_widths[fieldname], `${width}px`);
		const reloaded = ui.reload();
		assert.equal(reloaded.get_configured_column_width(fieldname), width);
		reloaded.apply_column_widths();
		const rendered = ui.styles.at(-1);
		assert.equal(rendered.selector, `.list-row-col[data-fieldname="${fieldname}"]`);
		assert.equal(rendered.style.width, `${width}px`);
		assert.equal(rendered.style.flex, `0 0 ${width}px`);
		assert.equal(rendered.style["min-width"], `${width}px`);
	});
}

test("common users save widths without global permissions", async () => {
	const ui = load_ui();
	ui.frappe.user_roles = [];
	await ui.list.save_column_width("name", 240);
	assert.equal(ui.calls.length, 1);
	assert.equal(ui.reload().get_configured_column_width("name"), 240);
});

test("consecutive drags preserve all widths, filters and other views", async () => {
	const ui = load_ui({
		List: { filters: [["enabled", "=", 1]], column_widths: { other: "190px" } },
		Kanban: { last_kanban_board: "Board" },
	});
	await Promise.all([
		ui.list.save_column_width("name", 230),
		ui.list.save_column_width("status_field", 180),
		ui.list.save_column_width("observacao", 772),
	]);
	const saved = ui.reload().user_settings;
	assert.deepEqual(saved.List.column_widths, {
		other: "190px",
		name: "230px",
		status_field: "180px",
		observacao: "772px",
	});
	assert.deepEqual(saved.List.filters, [["enabled", "=", 1]]);
	assert.equal(saved.Kanban.last_kanban_board, "Board");
});

test("legacy Status widths are readable and migrate only after a successful save", async () => {
	const ui = load_ui({ List: { column_widths: { status_indicator: "195px" } } });
	assert.equal(ui.list.get_configured_column_width("status_field"), 195);
	await ui.list.save_column_width("status_field", 250);
	const list = ui.reload();
	assert.equal(list.get_configured_column_width("status_field"), 250);
	assert.equal(list.view_user_settings.column_widths.status_indicator, undefined);
	assert.equal(list.view_user_settings.column_widths.status_field, "250px");
});

test("failed saves report errors without mutating preferences and allow retry", async () => {
	const ui = load_ui({ List: { column_widths: { status_indicator: "195px" } } });
	ui.fail_next_saves(true);
	ui.list.resize_column("status_field", 300);
	await ui.list.save_column_width("status_field", 300, 195);
	assert.equal(ui.errors.length, 1);
	assert.equal(ui.alerts[0].indicator, "red");
	assert.equal(ui.list.get_configured_column_width("status_field"), 195);
	assert.equal(ui.reload().view_user_settings.column_widths.status_indicator, "195px");
	ui.fail_next_saves(false);
	await ui.list.save_column_width("status_field", 300);
	assert.equal(ui.reload().get_configured_column_width("status_field"), 300);
});

test("native field widths take priority over old global Property Setter defaults", () => {
	const ui = load_ui();
	ui.frappe.meta.get_docfield = () => ({ width: "900px" });
	ui.list.list_view_settings.fields = JSON.stringify([
		{ fieldname: "name", width: 220 },
		{ fieldname: "status_field", width: 180 },
		{ fieldname: "observacao", width: 772 },
	]);
	assert.equal(ui.list.get_configured_column_width("name"), 220);
	assert.equal(ui.list.get_configured_column_width("status_field"), 180);
	assert.equal(ui.list.get_configured_column_width("observacao"), 772);
});

test("dialog starts with effective personal widths without changing the list columns", () => {
	const ui = load_ui({ List: { column_widths: { name: "220px", status_indicator: "180px" } } });
	ui.frappe.model.with_doctype = (_doctype, callback) => callback();
	const proto = ui.context.ListSettings.prototype;
	let dialog;
	let html;
	proto.make = function () {
		dialog = this;
		this.dialog = {
			get_field: () => ({
				$wrapper: [{ getElementsByClassName: () => [{}] }],
				html: (value) => (html = value),
			}),
		};
	};
	proto.get_listview_fields = function () {
		this.fields = [{ fieldname: "name", width: 100 }, { fieldname: "status_field" }];
	};
	proto.setup_remove_fields = proto.add_new_fields = proto.show_dialog = () => {};
	dialog = new ui.context.ListSettings({
		listview: ui.list,
		doctype: ui.list.doctype,
		meta: {},
		settings: {},
	});
	dialog.setup_fields();
	assert.equal(dialog.fields[0].width, 220);
	assert.equal(dialog.fields[1].width, 180);
	assert.equal(
		ui.list.columns.some((col) => col.type === "Tag"),
		true
	);
	assert.match(html, /value="220"/);
	assert.match(html, /value="180"/);
	dialog.fields[1].width = 275;
	dialog.setup_fields();
	assert.match(html, /value="275"/);
});

test("saving dialog widths updates personal overrides, including blank and legacy Status", async () => {
	const ui = load_ui({
		List: { column_widths: { name: "220px", status_indicator: "180px", other: "190px" } },
	});
	await ui.list.save_personal_column_widths([
		{ fieldname: "name", width: 260 },
		{ fieldname: "status_field" },
		{ fieldname: "observacao", width: 772 },
	]);
	assert.deepEqual(ui.reload().view_user_settings.column_widths, {
		name: "260px",
		other: "190px",
		observacao: "772px",
	});
});

test("saved-layout widths stay isolated from personal and legacy defaults", async () => {
	const ui = load_ui({ List: { column_widths: { name: "220px" } } });
	ui.list.list_filter = {
		active_layout_name: "saved-layout",
		get_active_layout: () => ({}),
		can_edit_layout: () => true,
		get_current_columns_state: () => [{ fieldname: "name", width: 330 }],
		async update_layout_columns(_layout, fields) {
			assert.equal(fields[0].width, 450);
		},
	};
	ui.list.columns[0].df.width = 330;
	assert.equal(ui.list.get_configured_column_width("name"), 330);
	await ui.list.save_column_width("name", 450);
	assert.equal(ui.list.get_configured_column_width("name"), 450);
	assert.equal(ui.calls.length, 0);
	assert.equal(ui.reload().get_configured_column_width("name"), 220);
});

test("creating layouts captures effective widths instead of stale metadata defaults", () => {
	const ui = load_ui({ List: { column_widths: { name: "220px", status_field: "180px" } } });
	ui.list.columns[0].df.width = 900;
	const fields = ui.context.ListFilterMenu.get_current_columns_state.call({
		list_view: ui.list,
	});
	assert.equal(fields.find((field) => field.fieldname === "name").width, 220);
	assert.equal(fields.find((field) => field.fieldname === "status_field").width, 180);
	const selector = Object.assign(Object.create(ui.context.LayoutFieldSelector.prototype), {
		list_view: ui.list,
		preserved_widths: [],
	});
	assert.equal(selector.get_field_width({ fieldname: "name" }, 0), 220);
	assert.equal(selector.get_field_width({ fieldname: "status_field" }, 1), 180);
	assert.equal(selector.get_field_width({ fieldname: "name", width: 330 }, 0), 330);
});

test("resize uses the native handle and is disabled for mobile or disabled scrolling", () => {
	const ui = load_ui();
	const header = ui.list.get_header_html();
	assert.match(header, /data-fieldname="name"/);
	assert.match(header, /data-fieldname="status_field"/);
	assert.equal((header.match(/class="list-col-resize-handle"/g) || []).length, 4);
	assert.doesNotMatch(header, /class="resizer/);
	assert.equal(ui.list.is_column_resizable(ui.list.columns[0]), true);
	assert.equal(ui.list.is_column_resizable(ui.list.columns[2]), true);
	assert.equal(ui.list.is_column_resizable(ui.list.columns[1]), false);
	ui.list.list_view_settings.disable_scrolling = 1;
	assert.equal(ui.list.is_column_resizable(ui.list.columns[0]), false);
	ui.list.list_view_settings.disable_scrolling = 0;
	ui.frappe.is_mobile = () => true;
	assert.equal(ui.list.is_column_resizable(ui.list.columns[2]), false);
});

test("mouse drag uses the native handle, supports RTL and persists on mouseup", async () => {
	for (const rtl of [false, true]) {
		const ui = load_ui();
		const handlers = {};
		const body_classes = new Set();
		const document = { body: {} };
		const column = {
			closest() {
				return this;
			},
			attr: () => "status_field",
			outerWidth: () => 150,
			addClass() {},
			removeClass() {},
		};
		const document_events = {
			off() {},
			on(event, callback) {
				handlers[event] = callback;
			},
			one(event, callback) {
				handlers[event] = callback;
			},
		};
		ui.context.$ = Object.assign((target) => {
			if (target === document) return document_events;
			if (target === document.body) {
				return {
					addClass: (value) => body_classes.add(value),
					removeClass: (value) => body_classes.delete(value),
				};
			}
			return target;
		}, ui.context.$);
		ui.context.document = document;
		ui.frappe.utils.is_rtl = () => rtl;
		ui.list.page = {
			wrapper: {
				off() {},
				on(event, selector, callback) {
					assert.equal(selector, ".list-row-head .list-col-resize-handle");
					handlers[event] = callback;
				},
			},
		};
		ui.list.setup_column_resize();
		handlers["mousedown.list-column-resize"]({
			preventDefault() {},
			stopPropagation() {},
			currentTarget: column,
			pageX: 100,
		});
		assert.equal(body_classes.has("list-col-resizing"), true);
		handlers["mousemove.list-column-resize-drag"]({ pageX: rtl ? 50 : 150 });
		handlers["mouseup.list-column-resize-drag"]();
		await ui.list._column_width_save;
		assert.equal(body_classes.has("list-col-resizing"), false);
		assert.equal(ui.reload().get_configured_column_width("status_field"), 200);
	}
});

test("dialog saves global fields and synchronizes personal widths before refresh", async () => {
	const ui = load_ui({ List: { column_widths: { name: "220px" } } });
	let action;
	let hidden = false;
	let refreshed = false;
	const section = {
		find() {
			return this;
		},
		hide() {},
		css() {},
	};
	ui.frappe.ui = {
		Dialog: class {
			constructor() {
				this.$wrapper = { find: () => section };
			}
			set_values() {}
			set_primary_action(_label, callback) {
				action = callback;
			}
			get_values() {
				return {};
			}
			hide() {
				hidden = true;
			}
		},
	};
	ui.frappe.get_meta = () => ({ fields: [] });
	const personal_call = ui.frappe.call;
	ui.frappe.call = async (options) => {
		if (options.method.endsWith("save_listview_settings")) {
			ui.calls.push(options);
			return {
				message: {
					meta: {},
					listview_settings: { fields: options.args.listview_settings.fields },
				},
			};
		}
		return personal_call(options);
	};
	const dialog = Object.assign(Object.create(ui.context.ListSettings.prototype), {
		listview: ui.list,
		doctype: ui.list.doctype,
		fields: [{ fieldname: "name", width: 310 }],
		update_fields() {},
	});
	ui.list.column_width_overrides.name = 220;
	ui.list.refresh_columns = async () => {
		assert.equal(ui.list.column_width_overrides.name, undefined);
		assert.equal(ui.list.get_configured_column_width("name"), 310);
		refreshed = true;
	};
	dialog.make();
	await action();
	assert.equal(ui.calls.length, 2);
	assert.equal(ui.calls[0].method.endsWith("save_listview_settings"), true);
	assert.equal(JSON.parse(ui.calls[0].args.listview_settings.fields)[0].width, 310);
	assert.equal(ui.reload().get_configured_column_width("name"), 310);
	assert.equal(refreshed, true);
	assert.equal(hidden, true);
});
