# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class CadEmpresa(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		cep: DF.Data
		cnpj: DF.Data
		codbairro: DF.Link
		codcidade: DF.Link
		codlogradouro: DF.Link | None
		compend: DF.Data | None
		emailcompra: DF.Data | None
		emailvenda: DF.Data | None
		inscestadual: DF.Data
		latitude_longitude: DF.Data | None
		name: DF.Int | None
		nomefantasia: DF.Data
		numend: DF.Int
		razaosocial: DF.Data
		telefone: DF.Data | None
	# end: auto-generated types

	pass
