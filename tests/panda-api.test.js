import assert from 'node:assert/strict'
import test from 'node:test'
import { createPandaApiClient, PandaApiError } from '../src/panda-api.js'

const CPF = { type: 'cpf', digits: '12345678901' }
const CNPJ = { type: 'cnpj', digits: '12345678000195' }
const CURRENT_TIME = Date.parse('2026-10-06T12:00:00.000Z')

function createHarness(fetchImpl) {
  const storage = { session: null, writes: [] }
  const client = createPandaApiClient({
    fetchImpl,
    sessionStore: {
      async get() {
        return storage.session
      },
      async set(session) {
        storage.session = session
        storage.writes.push(session)
      },
      async remove() {
        storage.session = null
      },
    },
    apiBaseUrl: 'https://api.example.test',
    now: () => CURRENT_TIME,
  })
  return { client, storage }
}

function guestResponse(token = 'guest-token', expiresAtUtc = '2026-10-06T12:05:00.000Z') {
  return Response.json({ accessToken: token, expiresAtUtc })
}

test('starts a guest session and validates CPF with the API contract', async () => {
  const calls = []
  const { client, storage } = createHarness(async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/auth/guest')) return guestResponse()
    return Response.json({ message: 'CPF válido.', cpf: CPF.digits })
  })

  const result = await client.validateDocument(CPF)

  assert.deepEqual(result, { valid: true, message: 'CPF válido.' })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://api.example.test/auth/guest')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[1].url, 'https://api.example.test/validate/cpf')
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json')
  assert.equal(calls[1].options.headers.Authorization, 'Bearer guest-token')
  assert.deepEqual(JSON.parse(calls[1].options.body), { cpf: CPF.digits })
  assert.equal(storage.session.token, 'guest-token')
  assert.equal(storage.writes.length, 1)
})

test('calls the CNPJ validation route and returns the expected label', async () => {
  const calls = []
  const { client } = createHarness(async (url, options) => {
    calls.push({ url: String(url), options })
    return calls.length === 1
      ? guestResponse()
      : Response.json({ message: 'CNPJ válido.', cnpj: CNPJ.digits })
  })

  assert.deepEqual(await client.validateDocument(CNPJ), {
    valid: true,
    message: 'CNPJ válido.',
  })
  assert.equal(calls[1].url, 'https://api.example.test/validate/cnpj')
  assert.deepEqual(JSON.parse(calls[1].options.body), { cnpj: CNPJ.digits })
})

test('preserves normalized alphanumeric CNPJ characters in the API route', async () => {
  const cnpj = { type: 'cnpj', digits: 'ABCDEF12345678' }
  const calls = []
  const { client } = createHarness(async (url, options) => {
    calls.push({ url: String(url), options })
    return calls.length === 1
      ? guestResponse()
      : Response.json({ message: 'CNPJ válido.', cnpj: cnpj.digits })
  })

  await client.validateDocument(cnpj)

  assert.equal(calls[1].url, 'https://api.example.test/validate/cnpj')
  assert.deepEqual(JSON.parse(calls[1].options.body), { cnpj: cnpj.digits })
})

test('uses a cached guest token and refreshes it before expiry', async () => {
  const calls = []
  const { client, storage } = createHarness(async (url) => {
    calls.push(String(url))
    return calls.at(-1).endsWith('/auth/guest')
      ? guestResponse('new-token')
      : Response.json({ message: 'CPF válido.' })
  })
  storage.session = {
    token: 'old-token',
    expiresAt: CURRENT_TIME + 20_000,
  }

  await client.validateDocument(CPF)

  assert.equal(calls.length, 2)
  assert.equal(calls[0], 'https://api.example.test/auth/guest')
  assert.equal(storage.session.token, 'new-token')
})

test('bases cached token lifetime on server Date to tolerate local clock skew', async () => {
  let guestRequests = 0
  const { client, storage } = createHarness(async (url) => {
    if (String(url).endsWith('/auth/guest')) {
      guestRequests += 1
      return Response.json({
        accessToken: 'guest-token',
        expiresAtUtc: '2026-10-06T12:03:00.000Z',
      }, {
        headers: { Date: 'Tue, 06 Oct 2026 11:58:00 GMT' },
      })
    }
    return Response.json({ message: 'CPF válido.' })
  })

  await client.validateDocument(CPF)
  await client.validateDocument(CPF)

  assert.equal(guestRequests, 1)
  assert.equal(storage.session.expiresAt, CURRENT_TIME + 5 * 60_000)
})

test('retries a rejected token once with a new guest session', async () => {
  let validations = 0
  const calls = []
  const { client, storage } = createHarness(async (url) => {
    calls.push(String(url))
    if (calls.at(-1).endsWith('/auth/guest')) {
      return guestResponse(calls.length === 1 ? 'expired-token' : 'renewed-token')
    }
    validations += 1
    if (validations === 1) return Response.json({ message: 'Unauthorized' }, { status: 401 })
    return Response.json({ message: 'CPF válido.' })
  })

  assert.deepEqual(await client.validateDocument(CPF), {
    valid: true,
    message: 'CPF válido.',
  })
  assert.equal(validations, 2)
  assert.equal(calls.filter((url) => url.endsWith('/auth/guest')).length, 2)
  assert.equal(storage.session.token, 'renewed-token')
})

test('returns invalid document responses without treating them as connection errors', async () => {
  const { client } = createHarness(async (url) => (
    String(url).endsWith('/auth/guest')
      ? guestResponse()
      : new Response('"CPF inválido."', { status: 400 })
  ))

  assert.deepEqual(await client.validateDocument(CPF), {
    valid: false,
    message: 'CPF inválido.',
  })
})

test('rejects invalid input before sending any request', async () => {
  let requestCount = 0
  const { client } = createHarness(async () => {
    requestCount += 1
    return guestResponse()
  })

  await assert.rejects(
    client.validateDocument({ type: 'cpf', digits: '123' }),
    { name: 'PandaApiError', message: 'Informe um CPF ou CNPJ com a quantidade correta de dígitos.' },
  )
  assert.equal(requestCount, 0)
})

test('rejects malformed guest tokens and expired sessions', async (t) => {
  await t.test('missing token', async () => {
    const { client } = createHarness(async () => Response.json({
      expiresAtUtc: '2026-10-06T12:05:00.000Z',
    }))
    await assert.rejects(client.validateDocument(CPF), PandaApiError)
  })

  await t.test('already expired token', async () => {
    const { client } = createHarness(async () => guestResponse(
      'expired-token',
      '2026-10-06T11:59:00.000Z',
    ))
    await assert.rejects(client.validateDocument(CPF), {
      name: 'PandaApiError',
      message: 'A API retornou uma sessão guest expirada.',
    })
  })
})

test('surfaces non-401 API errors with their HTTP status', async () => {
  const { client } = createHarness(async (url) => (
    String(url).endsWith('/auth/guest')
      ? guestResponse()
      : Response.json({ message: 'Limite de requisições excedido.' }, { status: 429 })
  ))

  await assert.rejects(client.validateDocument(CPF), {
    name: 'PandaApiError',
    message: 'Limite de requisições excedido.',
    status: 429,
  })
})

test('fails explicitly when the API rejects the renewed guest token', async () => {
  const { client } = createHarness(async (url) => (
    String(url).endsWith('/auth/guest')
      ? guestResponse()
      : Response.json({ message: 'Unauthorized' }, { status: 401 })
  ))

  await assert.rejects(client.validateDocument(CPF), {
    name: 'PandaApiError',
    message: 'A sessão guest foi recusada pela API. Tente novamente.',
    status: 401,
  })
})

test('generates each supported document type through its guest-authenticated route', async (t) => {
  const scenarios = [
    { kind: 'cpf', path: '/generate/cpf', payload: { cpf: '12345678901' }, expected: { type: 'cpf', digits: '12345678901' } },
    { kind: 'cnpj', path: '/generate/cnpj/numeric', payload: { cnpj: '12345678000195' }, expected: { type: 'cnpj', digits: '12345678000195' } },
    { kind: 'cnpj-alphanumeric', path: '/generate/cnpj/alphanumeric', payload: { cnpj: 'abcdef12345678' }, expected: { type: 'cnpj', digits: 'ABCDEF12345678' } },
  ]

  for (const scenario of scenarios) {
    await t.test(scenario.kind, async () => {
      const calls = []
      const { client } = createHarness(async (url, options) => {
        calls.push({ url: String(url), options })
        return calls.length === 1
          ? guestResponse()
          : Response.json(scenario.payload)
      })

      assert.deepEqual(await client.generateDocument(scenario.kind), scenario.expected)
      assert.equal(calls.length, 2)
      assert.equal(calls[0].url, 'https://api.example.test/auth/guest')
      assert.equal(calls[1].url, `https://api.example.test${scenario.path}`)
      assert.equal(calls[1].options.method, undefined)
      assert.equal(calls[1].options.headers.Authorization, 'Bearer guest-token')
      assert.equal(calls[1].options.body, undefined)
    })
  }
})

test('rejects invalid generator kinds and malformed API responses', async (t) => {
  await t.test('invalid kind does not call the API', async () => {
    let requestCount = 0
    const { client } = createHarness(async () => {
      requestCount += 1
      return guestResponse()
    })

    await assert.rejects(client.generateDocument('random'), {
      name: 'PandaApiError',
      message: 'Escolha CPF, CNPJ ou CNPJ alfanumérico para gerar.',
    })
    assert.equal(requestCount, 0)
  })

  await t.test('wrong response shape is explicit', async () => {
    const { client } = createHarness(async (url) => (
      String(url).endsWith('/auth/guest')
        ? guestResponse()
        : Response.json({ cnpj: 'not-a-cnpj' })
    ))

    await assert.rejects(client.generateDocument('cnpj'), {
      name: 'PandaApiError',
      message: 'A API retornou um documento gerado em formato inválido.',
    })
  })
})

test('renews guest token when the generator endpoint returns 401', async () => {
  let generatorRequests = 0
  const calls = []
  const { client } = createHarness(async (url) => {
    calls.push(String(url))
    if (calls.at(-1).endsWith('/auth/guest')) {
      return guestResponse(calls.filter((call) => call.endsWith('/auth/guest')).length === 1
        ? 'expired-token'
        : 'renewed-token')
    }
    generatorRequests += 1
    if (generatorRequests === 1) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ cpf: '12345678901' })
  })

  assert.deepEqual(await client.generateDocument('cpf'), {
    type: 'cpf',
    digits: '12345678901',
  })
  assert.equal(generatorRequests, 2)
  assert.equal(calls.filter((call) => call.endsWith('/auth/guest')).length, 2)
})

test('coalesces simultaneous guest requests', async () => {
  let loginCount = 0
  const validationTokens = []
  const { client } = createHarness(async (url, options) => {
    if (String(url).endsWith('/auth/guest')) {
      loginCount += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return guestResponse()
    }
    validationTokens.push(options.headers.Authorization)
    return Response.json({ message: 'Documento válido.' })
  })

  await Promise.all([
    client.validateDocument(CPF),
    client.validateDocument(CNPJ),
  ])

  assert.equal(loginCount, 1)
  assert.deepEqual(validationTokens, ['Bearer guest-token', 'Bearer guest-token'])
})
