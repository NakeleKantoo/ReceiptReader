import { validarBoleto, identificarTipoCodigo } from "@mrmgomes/boleto-utils";

/**
 * Parses a boleto barcode or linha digitável and returns its data as JSON.
 * @param {string} code - The boleto barcode or linha digitável.
 * @returns {Promise<object>} - Parsed boleto data.
 */
export async function parseBoleto(code) {
  if (!code || typeof code !== "string") {
    throw new Error("Invalid argument: code must be a string.");
  }

  const tipoCodigo = identificarTipoCodigo(code);
  if (!tipoCodigo) {
    throw new Error("Invalid boleto format: could not identify code type.");
  }

  const result = validarBoleto(code, tipoCodigo);

  return {
    success: result.sucesso,
    message: result.mensagem,
    type: result.tipoBoleto,
    bankCode: result.codigoBanco,
    barcode: result.codigoBarras,
    linhaDigitavel: result.linhaDigitavel,
    value: result.valor,
    dueDate: result.vencimento,
    newDueDate2025: result.vencimentoComNovoFator2025,
  };
}
