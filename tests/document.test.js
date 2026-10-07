import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBrazilianDocument, parseBrazilianDocument } from '../src/document.js'

test('identifies and normalizes a CPF with punctuation', () => {
  assert.deepEqual(parseBrazilianDocument('123.456.789-01'), {
    type: 'cpf',
    digits: '12345678901',
  })
})

test('identifies and normalizes a CNPJ with commas and separators', () => {
  assert.deepEqual(parseBrazilianDocument('12,345,678/0001-95'), {
    type: 'cnpj',
    digits: '12345678000195',
  })
})

test('identifies and formats an alphanumeric CNPJ supported by the API', () => {
  const document = parseBrazilianDocument('Ab.CdE.F12/3456-78')

  assert.deepEqual(document, {
    type: 'cnpj',
    digits: 'ABCDEF12345678',
  })
  assert.equal(formatBrazilianDocument(document), 'AB.CDE.F12/3456-78')
})

test('rejects text, unsupported punctuation, and unexpected digit counts', () => {
  assert.equal(parseBrazilianDocument('CPF: 123.456.789-01'), null)
  assert.equal(parseBrazilianDocument('123.456.789-0'), null)
  assert.equal(parseBrazilianDocument('12345678901;'), null)
  assert.equal(parseBrazilianDocument('ABCDEFGHIJKLMN'), null)
  assert.equal(parseBrazilianDocument('ABCDEF123456XY'), null)
  assert.equal(parseBrazilianDocument(null), null)
})

test('formats normalized CPF and CNPJ digits for display', () => {
  assert.equal(
    formatBrazilianDocument({ type: 'cpf', digits: '12345678901' }),
    '123.456.789-01',
  )
  assert.equal(
    formatBrazilianDocument({ type: 'cnpj', digits: '12345678000195' }),
    '12.345.678/0001-95',
  )
})
