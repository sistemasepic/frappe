// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt
import FormTimeline from "./form_timeline";
frappe.ui.form.Footer = class FormFooter {
	constructor(opts) {
		$.extend(this, opts);
		this.make();
		this.make_comment_box();
		this.make_timeline();
		this.setup_comments_toggle_listener();
		this.setup_activity_toggle_listener();
		this.setup_scroll_to_top_visibility();
		// render-complete
		$(this.frm.wrapper).on("render_complete", () => {
			this.refresh();
		});
	}
	make() {
		this.wrapper = $(frappe.render_template("form_footer", {})).appendTo(this.parent);
		this.scroll_to_top_btn = this.wrapper.find(".scroll-to-top");
		this.scroll_to_top_btn.addClass("hidden");
		this.wrapper.find(".btn-save").click(() => {
			this.frm.save("Save", null, this);
		});
	}
	make_comment_box() {
		this.frm.comment_box = frappe.ui.form.make_control({
			parent: this.wrapper.find(".comment-box"),
			render_input: true,
			only_input: true,
			enable_mentions: true,
			df: {
				fieldtype: "Comment",
				fieldname: "comment",
			},
			on_submit: (comment) => {
				if (strip_html(comment).trim() != "" || comment.includes("img")) {
					this.frm.comment_box.disable();
					frappe
						.xcall("frappe.desk.form.utils.add_comment", {
							reference_doctype: this.frm.doctype,
							reference_name: this.frm.docname,
							content: comment,
							comment_email: frappe.session.user,
							comment_by: frappe.session.user_fullname,
						})
						.then(() => {
							this.frm.comment_box.set_value("");
							frappe.utils.play_sound("click");
						})
						.finally(() => {
							this.frm.comment_box.enable();
						});
				}
			},
		});

		$(this.frm.comment_box?.wrapper).closest(".comment-box").addClass("hidden");
		this.frm.comment_visible = false;
	}
	make_timeline() {
		this.frm.timeline = new FormTimeline({
			parent: this.wrapper.find(".timeline"),
			frm: this.frm,
		});

		$(this.frm.timeline?.timeline_wrapper).addClass("hidden");
		this.frm.timeline_visible = false;
	}
	refresh() {
		this.setup_comments_toggle_listener();
		this.setup_activity_toggle_listener();
		this.setup_scroll_to_top_visibility();

		if (this.frm.doc.__islocal) {
			this.parent.addClass("hide");
		} else {
			this.parent.removeClass("hide");
			this.frm.timeline.refresh();

			if (this._last_docname !== this.frm.doc.name) {
				this._last_docname = this.frm.doc.name;
				$(this.frm.comment_box?.wrapper).closest(".comment-box").addClass("hidden");
				this.frm.comment_visible = false;
				$(this.frm.timeline?.timeline_wrapper).addClass("hidden");
				this.frm.timeline_visible = false;
			}
		}
		this.update_scroll_to_top_visibility();
		this.refresh_comments_count();
	}

	refresh_comments_count() {
		let count = (this.frm.get_docinfo()?.comments || []).length;
		this.wrapper.find(".comment-count")?.html(count ? `(${count})` : "");
	}

	setup_comments_toggle_listener() {
		if (this._comment_toggle_handler) {
			return;
		}

		this._comment_toggle_handler = (e, data) => {
			if (!data || data.doctype !== this.frm.doctype || data.name !== this.frm.doc?.name) {
				return;
			}

			const comment_box_wrapper = $(this.frm.comment_box?.wrapper).closest(".comment-box");
			comment_box_wrapper.toggleClass("hidden", !Boolean(data.visible));
		};

		$(document).on("erp360:comment:toggle", this._comment_toggle_handler);
	}

	setup_activity_toggle_listener() {
		if (this._activity_toggle_handler) {
			return;
		}

		this._activity_toggle_handler = (e, data) => {
			if (!data || data.doctype !== this.frm.doctype || data.name !== this.frm.doc?.name) {
				return;
			}

			$(this.frm.timeline?.timeline_wrapper).toggleClass("hidden", !Boolean(data.visible));
		};

		$(document).on("erp360:activity:toggle", this._activity_toggle_handler);
	}

	get_scroll_container() {
		const closest_main_section = $(this.frm.wrapper).closest(".main-section");
		if (closest_main_section.length) {
			return closest_main_section;
		}

		return $(".main-section").first();
	}

	setup_scroll_to_top_visibility() {
		if (this._scroll_to_top_visibility_handler) {
			return;
		}

		const scroll_container = this.get_scroll_container();
		if (!scroll_container.length) {
			this.scroll_to_top_btn?.addClass("hidden");
			return;
		}

		this._scroll_container = scroll_container;
		this._scroll_to_top_visibility_handler = () => this.update_scroll_to_top_visibility();

		this._scroll_container.on("scroll", this._scroll_to_top_visibility_handler);
		$(window).on("resize", this._scroll_to_top_visibility_handler);
		this.update_scroll_to_top_visibility();
	}

	update_scroll_to_top_visibility() {
		const button = this.scroll_to_top_btn || this.wrapper.find(".scroll-to-top");
		if (!button?.length) {
			return;
		}

		if (this.frm.doc.__islocal) {
			button.addClass("hidden");
			return;
		}

		const scroll_container = this._scroll_container?.length
			? this._scroll_container
			: this.get_scroll_container();

		if (!scroll_container?.length) {
			button.addClass("hidden");
			return;
		}

		const scroll_element = scroll_container.get(0);
		const has_scrollable_content = scroll_element.scrollHeight - scroll_element.clientHeight > 24;
		const is_scrolled = scroll_element.scrollTop > 120;

		button.toggleClass("hidden", !(has_scrollable_content && is_scrolled));
	}

	destroy() {
		if (this._comment_toggle_handler) {
			$(document).off("erp360:comment:toggle", this._comment_toggle_handler);
			this._comment_toggle_handler = null;
		}

		if (this._activity_toggle_handler) {
			$(document).off("erp360:activity:toggle", this._activity_toggle_handler);
			this._activity_toggle_handler = null;
		}

		if (this._scroll_to_top_visibility_handler) {
			this._scroll_container?.off("scroll", this._scroll_to_top_visibility_handler);
			$(window).off("resize", this._scroll_to_top_visibility_handler);
			this._scroll_to_top_visibility_handler = null;
			this._scroll_container = null;
		}
	}
};
