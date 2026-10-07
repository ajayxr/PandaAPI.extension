export const API_BASE_URL = 'https://api.pandaapi.com.br'

const TOKEN_REFRESH_MARGIN_MS = 30_000
const REQUEST_TIMEOUT_MS = 10_000

export class PandaApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'PandaApiError'
    this.status = status
  }
}

async function readResponseMessage(response) {
  const body = await response.text()
  if (!body) return `A API respondeu com erro (HTTP ${response.status}).`

  try {
    const payload = JSON.parse(body)
    if (typeof payload === 'string') return payload
    const message = payload?.message ?? payload?.title
    if (typeof message === 'string') return message
  } catch {
    return body
  }

  return body
}

export function createPandaApiClient({
  fetchImpl = fetch,
  sessionStore,
  apiBaseUrl = API_BASE_URL,
  now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!sessionStore) {
    throw new TypeError('Um armazenamento de sessão precisa ser informado.')
  }

  let guestTokenRequest

  async function requestGuestToken() {
    let response
    try {
      response = await fetchImpl(`${apiBaseUrl}/auth/guest`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new PandaApiError(
        error.name === 'TimeoutError'
          ? 'O login guest demorou demais. Tente novamente.'
          : 'Não foi possível conectar à PandaAPI para iniciar a sessão guest.',
      )
    }

    if (!response.ok) {
      throw new PandaApiError(await readResponseMessage(response), response.status)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new PandaApiError('A API retornou uma resposta inválida ao iniciar a sessão guest.')
    }

    const tokenValue = payload?.accessToken ?? payload?.access_token ?? payload?.token
    const token = typeof tokenValue === 'string'
      ? tokenValue.trim().replace(/^Bearer\s+/i, '')
      : ''
    if (!token || /[\r\n]/.test(token)) {
      throw new PandaApiError('A resposta da API não contém um token guest válido.')
    }

    const expiryValue = payload?.expiresAtUtc ?? payload?.expires_at_utc
    const serverExpiresAt = Date.parse(expiryValue ?? '')
    if (!Number.isFinite(serverExpiresAt)) {
      throw new PandaApiError('A API retornou uma expiração de sessão inválida.')
    }
    const serverDate = Date.parse(response.headers.get('date') ?? '')
    const expiresInMs = serverExpiresAt - (Number.isFinite(serverDate) ? serverDate : now())
    if (expiresInMs <= 0) {
      throw new PandaApiError('A API retornou uma sessão guest expirada.')
    }

    const expiresAt = now() + expiresInMs
    await sessionStore.set({ token, expiresAt })
    return token
  }

  async function getGuestToken(forceNew = false) {
    if (!forceNew) {
      const session = await sessionStore.get()
      if (
        typeof session?.token === 'string' &&
        Number.isFinite(session.expiresAt) &&
        session.expiresAt - now() > TOKEN_REFRESH_MARGIN_MS
      ) {
        return session.token
      }
    }

    if (!guestTokenRequest) {
      guestTokenRequest = requestGuestToken().finally(() => {
        guestTokenRequest = undefined
      })
    }

    return guestTokenRequest
  }

  async function requestValidation(document, token) {
    const endpoint = document.type === 'cpf' ? 'cpf' : 'cnpj'
    const documentProperty = document.type === 'cpf' ? 'cpf' : 'cnpj'
    let response
    try {
      response = await fetchImpl(
        `${apiBaseUrl}/validate/${endpoint}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ [documentProperty]: document.digits }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      )
    } catch (error) {
      throw new PandaApiError(
        error.name === 'TimeoutError'
          ? 'A validação demorou demais. Tente novamente.'
          : 'Não foi possível conectar à PandaAPI para validar o documento.',
      )
    }

    if (response.status === 400) {
      return { valid: false, message: await readResponseMessage(response) }
    }
    if (!response.ok) {
      throw new PandaApiError(await readResponseMessage(response), response.status)
    }

    return {
      valid: true,
      message: document.type === 'cpf' ? 'CPF válido.' : 'CNPJ válido.',
    }
  }

  async function requestGeneratedDocument(kind, token) {
    const endpointByKind = {
      cpf: 'cpf',
      cnpj: 'cnpj/numeric',
      'cnpj-alphanumeric': 'cnpj/alphanumeric',
    }
    const endpoint = endpointByKind[kind]
    if (!endpoint) {
      throw new PandaApiError('Escolha CPF, CNPJ ou CNPJ alfanumérico para gerar.')
    }

    let response
    try {
      response = await fetchImpl(`${apiBaseUrl}/generate/${endpoint}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new PandaApiError(
        error.name === 'TimeoutError'
          ? 'A geração demorou demais. Tente novamente.'
          : 'Não foi possível conectar à PandaAPI para gerar o documento.',
      )
    }

    if (!response.ok) {
      throw new PandaApiError(await readResponseMessage(response), response.status)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new PandaApiError('A API retornou uma resposta inválida ao gerar o documento.')
    }

    const generatedValue = kind === 'cpf'
      ? payload?.cpf ?? payload?.Cpf
      : payload?.cnpj ?? payload?.Cnpj
    const document = typeof generatedValue === 'string' ? generatedValue.trim().toUpperCase() : ''
    const type = kind === 'cpf' ? 'cpf' : 'cnpj'
    const validFormat = type === 'cpf'
      ? /^\d{11}$/.test(document)
      : /^[A-Z0-9]{12}\d{2}$/.test(document)
    if (!validFormat) {
      throw new PandaApiError('A API retornou um documento gerado em formato inválido.')
    }

    return { type, digits: document }
  }

  async function withGuestSession(request) {
    const token = await getGuestToken()
    try {
      return await request(token)
    } catch (error) {
      if (error.status !== 401) throw error
    }

    await sessionStore.remove()
    const renewedToken = await getGuestToken(true)
    try {
      return await request(renewedToken)
    } catch (error) {
      if (error.status === 401) {
        throw new PandaApiError('A sessão guest foi recusada pela API. Tente novamente.', 401)
      }
      throw error
    }
  }

  async function validateDocument(document) {
    const validFormat = document?.type === 'cpf'
      ? typeof document.digits === 'string' && /^\d{11}$/.test(document.digits)
      : document?.type === 'cnpj'
        ? typeof document.digits === 'string' && /^[A-Z0-9]{12}\d{2}$/.test(document.digits)
        : false

    if (!validFormat) {
      throw new PandaApiError('Informe um CPF ou CNPJ com a quantidade correta de dígitos.')
    }

    return withGuestSession((token) => requestValidation(document, token))
  }

  async function generateDocument(kind) {
    if (!['cpf', 'cnpj', 'cnpj-alphanumeric'].includes(kind)) {
      throw new PandaApiError('Escolha CPF, CNPJ ou CNPJ alfanumérico para gerar.')
    }

    return withGuestSession((token) => requestGeneratedDocument(kind, token))
  }

  return { validateDocument, generateDocument }
}
