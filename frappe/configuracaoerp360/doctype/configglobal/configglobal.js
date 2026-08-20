// Copyright (c) 2026, Frappe Technologies and contributors
// For license information, please see license.txt

const REGRA_QTD_SUG_MIN_PADRAO = 40;
const PADROES_DEMANDA_SUGESTAO_COMPRA = [
	{ fieldname: "Suave", label: __("Suave") },
	{ fieldname: "Intermitente", label: __("Intermitente") },
	{ fieldname: "Erratica", label: __("Errática") },
	{ fieldname: "Irregular", label: __("Irregular") },
	{ fieldname: "Morta", label: __("Morta") },
];

function obter_regra_qtd_sug_min(raw_value) {
	let regra = raw_value;
	if (typeof regra === "string") {
		try {
			regra = JSON.parse(regra);
		} catch {
			regra = {};
		}
	}

	const valores = {};
	for (const padrao of PADROES_DEMANDA_SUGESTAO_COMPRA) {
		const valor = Number.parseInt(regra?.[padrao.fieldname], 10);
		valores[padrao.fieldname] = Number.isInteger(valor) && valor >= 0 && valor <= 100
			? valor
			: REGRA_QTD_SUG_MIN_PADRAO;
	}

	return valores;
}

function abrir_dialogo_regra_qtd_sug_min(frm) {
	const regra_atual = obter_regra_qtd_sug_min(frm.doc.regraqtdsugmin);
	const dialog = new frappe.ui.Dialog({
		title: __("Ajustar sugestão de compra"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "orientacao",
				options: `<div class="text-muted" style="font-size:12px; line-height:1.5;">${__("Defina o percentual máximo de diferença entre a quantidade sugerida e o múltiplo de compra para que o múltiplo seja aceito.")}</div>`,
			},
			...PADROES_DEMANDA_SUGESTAO_COMPRA.map((padrao) => ({
				fieldtype: "Int",
				fieldname: padrao.fieldname,
				label: padrao.label,
				default: regra_atual[padrao.fieldname],
				reqd: 1,
				min: 0,
				max: 100,
			})),
		],
		primary_action_label: __("Salvar"),
		primary_action: async (values) => {
			const regra = {};
			for (const padrao of PADROES_DEMANDA_SUGESTAO_COMPRA) {
				const valor = Number.parseInt(values?.[padrao.fieldname], 10);
				if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
					frappe.msgprint({
						title: __("Percentual inválido"),
						message: __("Informe para {0} um percentual inteiro entre 0 e 100.", [padrao.label]),
						indicator: "red",
					});
					return;
				}

				regra[padrao.fieldname] = valor;
			}

			await frm.set_value("regraqtdsugmin", regra);
			await frm.save();
			dialog.hide();
		},
	});

	dialog.show();
}

frappe.ui.form.on("ConfigGlobal", {
	btnalterasugcompra(frm) {
		abrir_dialogo_regra_qtd_sug_min(frm);
	},

	async sincproderp(frm) {
		if (!frappe.user.has_role("System Manager")) {
			frappe.msgprint({
				title: __("Permissão insuficiente"),
				message: __("Apenas usuários com perfil System Manager podem sincronizar produtos."),
				indicator: "red",
			});
			return;
		}

		const preview = await frappe.call({
			method: "erp360.utils.sinc_dados_erp.get_produtos_sync_preview",
			freeze: true,
			freeze_message: __("Buscando produtos no ERP..."),
		});

		const data = preview.message || {};
		const totalNovos = cint(data.total_novos);
		const totalAtualizar = cint(data.total_atualizar);

		if (!totalNovos && !totalAtualizar) {
			frappe.msgprint({
				title: __("Sincronização de Produtos"),
				message: __("Nenhum produto encontrado no ERP para sincronizar."),
				indicator: "green",
			});
			return;
		}

		const amostras = (data.novos_samples || []).slice(0, 10);
		const resumo = [
			__("Produtos no ERP: {0}", [cint(data.total_erp)]),
			"<br>",
			__("Produtos no sistema: {0}", [cint(data.total_sistema)]),
			"<br><br>",
			__("Novos a inserir: {0}", [totalNovos]),
			"<br>",
			__("Existentes a atualizar: {0}", [totalAtualizar]),
			"<br><br>",
			__("Deseja executar a sincronização?"),
		];

		if (amostras.length) {
			resumo.push(
				"<br><br>" + __("Exemplos de novos produtos:") + "<br>- " + amostras.join("<br>- ")
			);
		}

		frappe.confirm(
			resumo.join(""),
			async () => {
				const sync = await frappe.call({
					method: "erp360.utils.sinc_dados_erp.sync_produtos_from_erp",
					freeze: true,
					freeze_message: __("Sincronizando produtos..."),
				});

				const result = sync.message || {};
				frappe.show_alert(
					{
						message: __(
							"Sincronização concluída. {0} inseridos, {1} atualizados.",
							[cint(result.inserted), cint(result.updated)]
						),
						indicator: "green",
					},
					7
				);

				frm.reload_doc();
			},
			() => {}
		);
	},

	async sincmarcaerp(frm) {
		if (!frappe.user.has_role("System Manager")) {
			frappe.msgprint({
				title: __("Permissão insuficiente"),
				message: __("Apenas usuários com perfil System Manager podem sincronizar marcas."),
				indicator: "red",
			});
			return;
		}

		const preview = await frappe.call({
			method: "erp360.utils.sinc_dados_erp.get_marcas_sync_preview",
			freeze: true,
			freeze_message: __("Buscando marcas no ERP..."),
		});

		const data = preview.message || {};
		const totalMissing = cint(data.total_missing);

		if (!totalMissing) {
			frappe.msgprint({
				title: __("Sincronização de Marcas"),
				message: __("Todas as marcas do ERP já estão cadastradas no sistema."),
				indicator: "green",
			});
			return;
		}

		const amostras = (data.missing_samples || []).slice(0, 10);
		const resumo = [
			__("Marcas no ERP: {0}", [cint(data.total_erp)]),
			"<br>",
			__("Marcas no sistema: {0}", [cint(data.total_sistema)]),
			"<br><br>",
			__("Foram encontradas {0} marcas não cadastradas no sistema. Deseja sincronizar?", [
				totalMissing,
			]),
		];

		if (amostras.length) {
			resumo.push("<br><br>" + __("Exemplos:") + "<br>- " + amostras.join("<br>- "));
		}

		frappe.confirm(
			resumo.join(""),
			async () => {
				const sync = await frappe.call({
					method: "erp360.utils.sinc_dados_erp.sync_marcas_from_erp",
					freeze: true,
					freeze_message: __("Sincronizando marcas..."),
				});

				const inserted = cint((sync.message || {}).inserted);
				frappe.show_alert(
					{
						message: __("Sincronização concluída. {0} marcas inseridas.", [inserted]),
						indicator: "green",
					},
					7
				);

				frm.reload_doc();
			},
			() => {}
		);
	},

	async sinccondpagamento(frm) {
		if (!frappe.user.has_role("System Manager")) {
			frappe.msgprint({
				title: __("Permissão insuficiente"),
				message: __(
					"Apenas usuários com perfil System Manager podem sincronizar condições de pagamento."
				),
				indicator: "red",
			});
			return;
		}

		const preview = await frappe.call({
			method: "erp360.utils.sinc_dados_erp.get_condicoes_pagamento_sync_preview",
			freeze: true,
			freeze_message: __("Buscando condições de pagamento no ERP..."),
		});

		const data = preview.message || {};
		const totalNovos = cint(data.total_novos);
		const totalAtualizar = cint(data.total_atualizar);

		if (!totalNovos && !totalAtualizar) {
			frappe.msgprint({
				title: __("Sincronização de Condições de Pagamento"),
				message: __("Nenhuma condição de pagamento encontrada no ERP para sincronizar."),
				indicator: "green",
			});
			return;
		}

		const amostras = (data.novos_samples || []).slice(0, 10);
		const resumo = [
			__("Condições no ERP: {0}", [cint(data.total_erp)]),
			"<br>",
			__("Condições no sistema: {0}", [cint(data.total_sistema)]),
			"<br><br>",
			__("Novas a inserir: {0}", [totalNovos]),
			"<br>",
			__("Existentes a atualizar: {0}", [totalAtualizar]),
			"<br><br>",
			__("Deseja executar a sincronização?"),
		];

		if (amostras.length) {
			resumo.push(
				"<br><br>"
					+ __("Exemplos de novas condições:")
					+ "<br>- "
					+ amostras.join("<br>- ")
			);
		}

		frappe.confirm(
			resumo.join(""),
			async () => {
				const sync = await frappe.call({
					method: "erp360.utils.sinc_dados_erp.sync_condicoes_pagamento_from_erp",
					freeze: true,
					freeze_message: __("Sincronizando condições de pagamento..."),
				});

				const result = sync.message || {};
				frappe.show_alert(
					{
						message: __(
							"Sincronização concluída. {0} inseridas, {1} atualizadas.",
							[cint(result.inserted), cint(result.updated)]
						),
						indicator: "green",
					},
					7
				);

				frm.reload_doc();
			},
			() => {}
		);
	},

	async sincparcerp(frm) {
		if (!frappe.user.has_role("System Manager")) {
			frappe.msgprint({
				title: __("Permissão insuficiente"),
				message: __("Apenas usuários com perfil System Manager podem sincronizar parceiros."),
				indicator: "red",
			});
			return;
		}

		const preview = await frappe.call({
			method: "erp360.utils.sinc_dados_erp.get_parceiros_sync_preview",
			freeze: true,
			freeze_message: __("Buscando parceiros pendentes no ERP..."),
		});

		const data = preview.message || {};
		const totalPendentes = cint(data.total_pendentes);

		if (!totalPendentes) {
			frappe.msgprint({
				title: __("Sincronização de Parceiros"),
				message: __("Nenhum parceiro pendente no ERP para sincronizar."),
				indicator: "green",
			});
			return;
		}

		const amostras = (data.samples || []).slice(0, 10);
		const resumo = [
			__("Parceiros pendentes no ERP: {0}", [totalPendentes]),
			"<br><br>",
			__("A sincronização é processada em lote e pode levar alguns minutos."),
			"<br><br>",
			__("Deseja executar a sincronização agora?"),
		];

		if (amostras.length) {
			resumo.push(
				"<br><br>" + __("Exemplos de parceiros pendentes:") + "<br>- " + amostras.join("<br>- ")
			);
		}

		frappe.confirm(
			resumo.join(""),
			async () => {
				const sync = await frappe.call({
					method: "erp360.utils.sinc_dados_erp.sync_parceiros_from_erp",
					args: { batch_size: 500 },
					freeze: true,
					freeze_message: __("Sincronizando parceiros..."),
				});

				const result = sync.message || {};
				const msg = [
					__("Sincronização concluída."),
					__("Processados: {0}", [cint(result.processed)]),
					__("Inseridos: {0}", [cint(result.inserted)]),
					__("Atualizados: {0}", [cint(result.updated)]),
					__("Marcados no ERP externo: {0}", [cint(result.marked_external)]),
					__("Vínculos de matriz atualizados: {0}", [cint(result.matrix_links_updated)]),
					__("Vínculos de matriz pendentes: {0}", [cint(result.matrix_links_pending)]),
					__("Erros: {0}", [cint(result.total_errors)]),
				];

				frappe.msgprint({
					title: __("Sincronização de Parceiros"),
					message: msg.join("<br>"),
					indicator: cint(result.total_errors) ? "orange" : "green",
				});

				frm.reload_doc();
			},
			() => {}
		);
	},
});
