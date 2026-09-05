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
		const item = regra?.[padrao.fieldname];
		const aninhado = item !== null && typeof item === "object";
		const valor = Number.parseInt(aninhado ? item.percentual : item, 10);
		valores[padrao.fieldname] = {
			percentual:
				Number.isInteger(valor) && valor >= 0 && valor <= 100
					? valor
					: REGRA_QTD_SUG_MIN_PADRAO,
			validar: aninhado ? (cint(item.validar) ? 1 : 0) : 1,
		};
	}

	return valores;
}

function abrir_dialogo_regra_qtd_sug_min(frm) {
	const regra_atual = obter_regra_qtd_sug_min(frm.doc.regraqtdsugmin);

	const linhas = PADROES_DEMANDA_SUGESTAO_COMPRA.map((padrao) => {
		const atual = regra_atual[padrao.fieldname];
		return `
			<tr data-padrao="${padrao.fieldname}">
				<td style="vertical-align: middle;">${padrao.label}</td>
				<td style="width: 130px;">
					<div class="input-group input-group-sm">
						<input type="number" class="form-control regra-percentual"
							min="0" max="100" step="1" value="${atual.percentual}">
						<span class="input-group-text">%</span>
					</div>
				</td>
				<td class="text-center" style="width: 90px; vertical-align: middle;">
					<div class="form-check form-switch d-inline-block mb-0">
						<input type="checkbox" class="form-check-input regra-validar"
							${atual.validar ? "checked" : ""}>
					</div>
				</td>
			</tr>`;
	}).join("");

	const dialog = new frappe.ui.Dialog({
		title: __("Ajustar sugestão de compra"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "regra_qtd_sug_min",
				options: `
					<div class="text-muted" style="font-size:12px; line-height:1.5; margin-bottom:10px;">
						${__("Defina o percentual máximo de diferença entre a quantidade sugerida e o múltiplo de compra para que o múltiplo seja aceito.")}<br>
						${__("Desative 'Validar' para não aplicar a regra ao padrão de demanda.")}
					</div>
					<table class="table table-bordered" style="margin-bottom:0;">
						<thead>
							<tr class="text-muted" style="font-size:11px; text-transform:uppercase;">
								<th>${__("Padrão de demanda")}</th>
								<th class="text-center">${__("Diferença máx.")}</th>
								<th class="text-center">${__("Validar")}</th>
							</tr>
						</thead>
						<tbody>${linhas}</tbody>
					</table>`,
			},
		],
		primary_action_label: __("Salvar"),
		primary_action: async () => {
			const regra = {};
			const invalidos = [];

			dialog.$wrapper.find("tbody tr[data-padrao]").each(function () {
				const linha = $(this);
				const padrao = String(linha.data("padrao"));
				const input = linha.find(".regra-percentual");
				const valor = Number.parseInt(input.val(), 10);

				if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
					input.addClass("is-invalid");
					invalidos.push(padrao);
					return;
				}

				input.removeClass("is-invalid");
				regra[padrao] = {
					percentual: valor,
					validar: linha.find(".regra-validar").is(":checked") ? 1 : 0,
				};
			});

			if (invalidos.length) {
				frappe.msgprint({
					title: __("Percentual inválido"),
					message: __("Informe para {0} um percentual inteiro entre 0 e 100.", [
						invalidos.join(", "),
					]),
					indicator: "red",
				});
				return;
			}

			await frm.set_value("regraqtdsugmin", regra);
			await frm.save();
			dialog.hide();
		},
	});

	dialog.$wrapper
		.find(".regra-validar")
		.on("change", function () {
			const linha = $(this).closest("tr");
			const habilitado = $(this).is(":checked");
			linha.find(".regra-percentual").prop("disabled", !habilitado);
			linha.toggleClass("text-muted", !habilitado);
		})
		.trigger("change");

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
			__("Produtos pendentes no ERP: {0}", [cint(data.total_erp)]),
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
				const msg = [
					__("Sincronização concluída."),
					__("Produtos inseridos: {0}", [cint(result.inserted)]),
					__("Produtos atualizados: {0}", [cint(result.updated)]),
					__("Registros marcados no ERP externo: {0}", [
						cint(result.marked_external),
					]),
					__("Erros: {0}", [cint(result.total_errors)]),
				];

				frappe.msgprint({
					title: __("Sincronização de Produtos"),
					message: msg.join("<br>"),
					indicator: cint(result.total_errors) ? "orange" : "green",
				});

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
		const totalPendentes = cint(data.total_erp);
		const totalMissing = cint(data.total_missing);

		if (!totalPendentes) {
			frappe.msgprint({
				title: __("Sincronização de Marcas"),
				message: __("Nenhuma marca pendente no ERP para sincronizar."),
				indicator: "green",
			});
			return;
		}

		const amostras = (data.missing_samples || []).slice(0, 10);
		const resumo = [
			__("Marcas pendentes no ERP: {0}", [totalPendentes]),
			"<br>",
			__("Marcas no sistema: {0}", [cint(data.total_sistema)]),
			"<br><br>",
			__("Marcas não cadastradas no sistema: {0}", [totalMissing]),
			"<br><br>",
			__("Deseja sincronizar as marcas pendentes?"),
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

				const result = sync.message || {};
				const msg = [
					__("Sincronização concluída."),
					__("Marcas inseridas: {0}", [cint(result.inserted)]),
					__("Marcas já existentes: {0}", [cint(result.already_existing)]),
					__("Registros marcados no ERP externo: {0}", [
						cint(result.marked_external),
					]),
					__("Erros: {0}", [cint(result.total_errors)]),
				];

				frappe.msgprint({
					title: __("Sincronização de Marcas"),
					message: msg.join("<br>"),
					indicator: cint(result.total_errors) ? "orange" : "green",
				});

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
			__("Condições pendentes no ERP: {0}", [cint(data.total_erp)]),
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
				const msg = [
					__("Sincronização concluída."),
					__("Condições inseridas: {0}", [cint(result.inserted)]),
					__("Condições atualizadas: {0}", [cint(result.updated)]),
					__("Registros marcados no ERP externo: {0}", [
						cint(result.marked_external),
					]),
					__("Erros: {0}", [cint(result.total_errors)]),
				];

				frappe.msgprint({
					title: __("Sincronização de Condições de Pagamento"),
					message: msg.join("<br>"),
					indicator: cint(result.total_errors) ? "orange" : "green",
				});

				frm.reload_doc();
			},
			() => {}
		);
	},

	async sincprodfor(frm) {
		if (!frappe.user.has_role("System Manager")) {
			frappe.msgprint({
				title: __("Permissão insuficiente"),
				message: __(
					"Apenas usuários com perfil System Manager podem sincronizar vínculos de produtos e fornecedores."
				),
				indicator: "red",
			});
			return;
		}

		const preview = await frappe.call({
			method: "erp360.utils.sinc_dados_erp.get_produtos_fornecedores_sync_preview",
			freeze: true,
			freeze_message: __("Buscando vínculos de produtos e fornecedores no ERP..."),
		});

		const data = preview.message || {};
		const totalProdutosPendentes = cint(data.total_produtos_pendentes);
		const totalPendentes = cint(data.total_pendentes);
		if (!totalProdutosPendentes) {
			frappe.msgprint({
				title: __("Vínculos Produto x Fornecedor"),
				message: __("Nenhum vínculo pendente no ERP para sincronizar."),
				indicator: "green",
			});
			return;
		}
		if (!totalPendentes) {
			frappe.msgprint({
				title: __("Vínculos Produto x Fornecedor"),
				message: __(
					"Existem produtos pendentes no ERP, mas nenhum possui cadastro ativo correspondente no sistema."
				),
				indicator: "orange",
			});
			return;
		}

		const amostras = (data.samples || []).slice(0, 10);
		const resumo = [
			__("Produtos pendentes no ERP: {0}", [totalProdutosPendentes]),
			"<br>",
			__("Produtos ativos encontrados no sistema: {0}", [
				cint(data.total_produtos_elegiveis),
			]),
			"<br>",
			__("Vínculos pendentes: {0}", [totalPendentes]),
			"<br><br>",
			__("Deseja importar os vínculos agora?"),
		];

		if (amostras.length) {
			resumo.push("<br><br>" + __("Exemplos:") + "<br>- " + amostras.join("<br>- "));
		}

		frappe.confirm(
			resumo.join(""),
			async () => {
				const sync = await frappe.call({
					method: "erp360.utils.sinc_dados_erp.sync_produtos_fornecedores_from_erp",
					freeze: true,
					freeze_message: __("Sincronizando vínculos de produtos e fornecedores..."),
				});

				const result = sync.message || {};
				const msg = [
					__("Sincronização concluída."),
					__("Produtos pendentes no ERP: {0}", [cint(result.products_pending)]),
					__("Produtos consultados: {0}", [cint(result.products_queried)]),
					__("Produtos sem cadastro ativo correspondente: {0}", [
						cint(result.products_not_eligible),
					]),
					__("Vínculos pendentes encontrados: {0}", [cint(result.pending)]),
					__("Vínculos inseridos: {0}", [cint(result.inserted)]),
					__("Vínculos já existentes: {0}", [cint(result.already_linked)]),
					__("Registros marcados no ERP externo: {0}", [cint(result.marked_external)]),
					__("Erros: {0}", [cint(result.total_errors)]),
				];

				frappe.msgprint({
					title: __("Vínculos Produto x Fornecedor"),
					message: msg.join("<br>"),
					indicator: cint(result.total_errors) ? "orange" : "green",
				});

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
