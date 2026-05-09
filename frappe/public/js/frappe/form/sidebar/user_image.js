frappe.ui.form.set_user_image = function (frm) {
	// Defensive programming: validate form sidebar exists
	if (!frm || !frm.sidebar || !frm.meta) {
		console.warn("frappe.ui.form.set_user_image: Invalid frm object", frm);
		return;
	}

	var image_section = frm.sidebar.image_section;
	var image_field = frm.meta.image_field;
	var image = image_field ? frm.doc[image_field] : null;
	var title_image = frm.page && frm.page.$title_area ? frm.page.$title_area.find(".title-image") : null;
	var image_wrapper = frm.sidebar.image_wrapper;
	
	// Validate DOM elements exist before manipulation
	if (!image_section || !image_wrapper || !title_image) {
		console.warn("frappe.ui.form.set_user_image: Required DOM elements not found");
		return;
	}

	var image_actions = image_wrapper.find(".sidebar-image-actions");

	// Toggle image section visibility based on field existence
	image_section.toggleClass("hide", !image_field);
	title_image.toggleClass("hide", !image_field);

	// Early return if no image field configured
	if (!image_field) {
		return;
	}

	// Process image if available
	if (image && typeof image === "string" && image.trim() !== "") {
		// Handle cordova mobile URLs
		image = window.cordova && image.indexOf("http") === -1 ? frappe.base_url + image : image;

		// Validate image URL before setting
		try {
			// Set src attribute
			image_section.find(".sidebar-image")
				.attr("src", image)
				.removeClass("hide")
				.off("error")
				.on("error", function () {
					// Fallback: hide broken image and show standard image
					$(this).addClass("hide");
					image_section.find(".sidebar-standard-image").removeClass("hide");
					console.warn("frappe.ui.form.set_user_image: Image failed to load:", image);
				});

			// Hide standard image when real image is shown
			image_section.find(".sidebar-standard-image").addClass("hide");

			// Set title area background image with fallback
			if (title_image.length) {
				title_image
					.css("background-image", `url("${image}")`)
					.html("")
					.off("error")
					.on("error", function () {
						$(this).css("background-image", "");
					});
			}

			// Show change and remove actions
			image_actions.find(".sidebar-image-change, .sidebar-image-remove").show();
		} catch (err) {
			console.error("frappe.ui.form.set_user_image: Error setting image", err);
			// Fallback to standard image
			image_section.find(".sidebar-image").addClass("hide");
			image_section.find(".sidebar-standard-image").removeClass("hide");
		}
	} else {
		// No image: show standard image with initials
		image_section.find(".sidebar-image").attr("src", null).addClass("hide");

		var title = frm.get_title && typeof frm.get_title === "function" ? frm.get_title() : frm.docname;

		image_section
			.find(".sidebar-standard-image")
			.removeClass("hide")
			.find(".standard-image")
			.html(frappe.get_abbr(title));

		// Set title area standard image
		if (title_image.length) {
			title_image
				.css("background-image", "")
				.html(frappe.get_abbr(title));
		}

		// Show change action, hide remove action
		image_actions.find(".sidebar-image-change").show();
		image_actions.find(".sidebar-image-remove").hide();
	}
};

frappe.ui.form.setup_user_image_event = function (frm) {
	// Defensive: validate frm and required properties
	if (!frm || !frm.meta || !frm.sidebar) {
		console.warn("frappe.ui.form.setup_user_image_event: Invalid frm object");
		return;
	}

	var image_field = frm.meta.image_field;

	// Skip setup if no image field configured
	if (!image_field) {
		return;
	}

	// Validate field exists in form
	if (!frm.fields_dict || !frm.fields_dict[image_field]) {
		console.warn("frappe.ui.form.setup_user_image_event: Image field not found in form", image_field);
		return;
	}

	// Re-draw image on change of user image
	if (typeof frappe.ui.form.on === "function") {
		frappe.ui.form.on(frm.doctype, image_field, function (frm) {
			frappe.ui.form.set_user_image(frm);
		});
	}

	// Setup image click handler if field is not read-only
	var image_field_df = frm.fields_dict[image_field].df;
	if (image_field_df && !image_field_df.read_only) {
		var image_wrapper = frm.sidebar.image_wrapper;
		
		if (image_wrapper && image_wrapper.length) {
			// Toggle dropdown on wrapper click (excluding actions)
			image_wrapper.off("click.sidebar-image").on("click.sidebar-image", ":not(.sidebar-image-actions)", function (e) {
				try {
					let $target = $(e.currentTarget);
					// Don't interfere with dropdown toggles
					if ($target.is("a.dropdown-toggle, .dropdown")) {
						return;
					}
					let dropdown = image_wrapper.find(".sidebar-image-actions .dropdown");
					if (dropdown && dropdown.length) {
						dropdown.toggleClass("open");
					}
					e.stopPropagation();
				} catch (err) {
					console.error("frappe.ui.form.setup_user_image_event: Error in click handler", err);
				}
			});

			// Bind change/remove actions
			image_wrapper.off("click.sidebar-image-actions").on(
				"click.sidebar-image-actions",
				".sidebar-image-change, .sidebar-image-remove",
				function (e) {
					try {
						let $target = $(e.currentTarget);
						var field = frm.get_field(image_field);

						if (!field) {
							console.warn("frappe.ui.form.setup_user_image_event: Image field not found");
							return;
						}

						if ($target.is(".sidebar-image-change")) {
							// Trigger file upload
							if (!field.$input) {
								field.make_input();
							}
							if (field.$input) {
								field.$input.trigger("attach_doc_image");
								// Close sidebar after upload trigger
								if (frm.page && typeof frm.page.close_sidebar === "function") {
									frm.page.close_sidebar();
								}
							}
						} else if ($target.is(".sidebar-image-remove")) {
							// Remove image: delete attachment and save
							if (frm.attachments && typeof frm.attachments.remove_attachment_by_filename === "function") {
								frm.attachments.remove_attachment_by_filename(
									frm.doc[image_field],
									function () {
										field.set_value("").then(() => {
											if (typeof frm.save === "function") {
												frm.save();
											}
										}).catch(err => {
											console.error("frappe.ui.form.setup_user_image_event: Error saving form after image removal", err);
										});
									}
								);
							}
						}
					} catch (err) {
						console.error("frappe.ui.form.setup_user_image_event: Error in action handler", err);
					}
				}
			);
		}
	}
};
