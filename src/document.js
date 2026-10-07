const ALLOWED_DOCUMENT_CHARACTERS = /^[\da-z\s.,/-]+$/i

export function parseBrazilianDocument(value) {
  if (typeof value !== 'string') return null

  const input = value.trim()
  if (!input || !ALLOWED_DOCUMENT_CHARACTERS.test(input)) return null

  const normalized = input.replace(/[\s.,/-]/g, '').toUpperCase()

  if (/^\d{11}$/.test(normalized)) return { type: 'cpf', digits: normalized }
  if (/^[A-Z0-9]{12}\d{2}$/.test(normalized)) {
    return { type: 'cnpj', digits: normalized }
  }

  return null
}

export function formatBrazilianDocument(document) {
  if (document.type === 'cpf') {
    return document.digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  return document.digits.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, '$1.$2.$3/$4-$5')
}
