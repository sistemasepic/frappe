# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ConfigGlobal(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		atualizaleadtimecadprod: DF.Check
		atualizamultiplocadprod: DF.Check
		cor_primaria_interface: DF.Color | None
		duplicarcnpjcpf: DF.Literal["N\u00e3o", "Apenas para Produtor Rural", "Sim"]
		padroniza_entradadados: DF.Literal["N\u00e3o alterar", "Mai\u00fascula"]
		pesquisarcep: DF.Literal["N\u00e3o", "Integrar API ViaCep"]
		pxmargensform: DF.Int
		regraqtdsugmin: DF.JSON | None
		validacnpjcpf: DF.Check
		validaremail: DF.Check
		validarie: DF.Literal["N\u00e3o", "Sim"]
	# end: auto-generated types

	def on_update(self):
		# Invalida o cache de bootinfo de todos os usuários para refletir
		# atualizações de aparência no próximo carregamento do Desk.
		frappe.cache.delete_key("bootinfo")
