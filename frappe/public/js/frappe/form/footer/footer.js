// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt
import FormTimeline from "./form_timeline";
frappe.ui.form.Footer = class FormFooter {
	constructor(opts) {
		$.extend(this, opts);
		this.make();
		this.make_comment_box();
		this.make_timeline();
		this.make_activity_accordion();
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
	}
	make_timeline() {
		this.frm.timeline = new FormTimeline({
			parent: this.wrapper.find(".timeline"),
			frm: this.frm,
		});
	}
	make_activity_accordion() {
		this.activity_accordion = this.wrapper.find(".form-activity-accordion");
		this.activity_content = this.wrapper.find(".form-activity-content");

		if (!this.activity_accordion.length || !this.activity_content.length) {
			return;
		}

		this.activity_accordion
			.find(".form-activity-count-icon")
			.html(frappe.utils.icon("es-line-chat-alt", "sm"));

		this._activity_accordion_handler = () => this.toggle_activity_section();
		this.activity_accordion.on("click", this._activity_accordion_handler);
		this.toggle_activity_section(false);
	}
	toggle_activity_section(state = null) {
		if (!this.activity_accordion?.length || !this.activity_content?.length) {
			return;
		}

		const expanded = state === null ? !Boolean(this.activity_expanded) : state;
		if (typeof expanded !== "boolean") {
			return;
		}

		this.activity_expanded = expanded;
		this.activity_content.toggleClass("hidden", !expanded);
		this.activity_accordion
			.toggleClass("active", expanded)
			.attr("aria-expanded", String(expanded));
		this.activity_accordion
			.find(".form-activity-accordion-toggle")
			.html(frappe.utils.icon(expanded ? "chevron-up" : "chevron-down", "sm"));
	}
	refresh_activity_count() {
		if (!this.activity_accordion?.length) {
			return;
		}

		const docinfo = this.frm.get_docinfo?.() || {};
		const comments = Array.isArray(docinfo.comments) ? docinfo.comments.length : 0;
		const communications = Array.isArray(docinfo.communications)
			? docinfo.communications.length
			: 0;
		const count = comments + communications;
		const badge = this.activity_accordion.find(".form-activity-count");

		badge.find(".form-activity-count-value").text(count || "");
		badge.toggleClass("hidden", count === 0);
	}
	refresh() {
		this.setup_scroll_to_top_visibility();

		if (this.frm.doc.__islocal) {
			this.parent.addClass("hide");
		} else {
			this.parent.removeClass("hide");
			this.frm.timeline?.refresh();

			const docname = this.frm.doc?.name;
			if (this._last_docname !== docname) {
				this._last_docname = docname;
				const comments = this.frm.get_docinfo?.()?.comments;
				this.toggle_activity_section(Array.isArray(comments) && comments.length > 0);
			}
		}
		this.update_scroll_to_top_visibility();
		this.refresh_activity_count();
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
		if (this._activity_accordion_handler) {
			this.activity_accordion?.off("click", this._activity_accordion_handler);
			this._activity_accordion_handler = null;
		}

		if (this._scroll_to_top_visibility_handler) {
			this._scroll_container?.off("scroll", this._scroll_to_top_visibility_handler);
			$(window).off("resize", this._scroll_to_top_visibility_handler);
			this._scroll_to_top_visibility_handler = null;
			this._scroll_container = null;
		}
	}
};
