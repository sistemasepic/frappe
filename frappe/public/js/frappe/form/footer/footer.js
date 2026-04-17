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
		// render-complete
		$(this.frm.wrapper).on("render_complete", () => {
			this.refresh();
		});
	}
	make() {
		this.wrapper = $(frappe.render_template("form_footer", {})).appendTo(this.parent);
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
	}
	refresh() {
		this.setup_comments_toggle_listener();

		if (this.frm.doc.__islocal) {
			this.parent.addClass("hide");
		} else {
			this.parent.removeClass("hide");
			this.frm.timeline.refresh();

			if (this._last_docname !== this.frm.doc.name) {
				this._last_docname = this.frm.doc.name;
				$(this.frm.comment_box?.wrapper).closest(".comment-box").addClass("hidden");
				this.frm.comment_visible = false;
			}
		}
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

	destroy() {
		if (this._comment_toggle_handler) {
			$(document).off("erp360:comment:toggle", this._comment_toggle_handler);
			this._comment_toggle_handler = null;
		}
	}
};
