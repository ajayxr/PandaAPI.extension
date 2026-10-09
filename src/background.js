import { createPandaApiClient } from './panda-api.js'
import { PRIVACY_CONSENT_KEY, PRIVACY_CONSENT_VERSION } from './privacy.js'

const TOKEN_STORAGE_KEY = 'guestAuth'

const pandaApi = createPandaApiClient({
  sessionStore: {
    async get() {
      const stored = await chrome.storage.session.get(TOKEN_STORAGE_KEY)
      return stored[TOKEN_STORAGE_KEY] ?? null
    },
    async set(session) {
      await chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: session })
    },
    async remove() {
      await chrome.storage.session.remove(TOKEN_STORAGE_KEY)
    },
  },
})

function readSelectionFromPage() {
  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    const start = activeElement.selectionStart ?? 0
    const end = activeElement.selectionEnd ?? 0
    return activeElement.value.slice(start, end)
  }

  return window.getSelection()?.toString() ?? ''
}

function writeTextToClipboard(text) {
  return navigator.clipboard.writeText(text).then(() => true, () => false)
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'copy-unformatted-document') return

  const stored = await chrome.storage.local.get(PRIVACY_CONSENT_KEY)
  if (stored[PRIVACY_CONSENT_KEY] !== PRIVACY_CONSENT_VERSION) return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  const [selection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: readSelectionFromPage,
  })
  const text = (selection?.result ?? '').replace(/[^p{L}p{N}]/gu, '')
  if (!text) return

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: writeTextToClipboard,
    args: [text],
  })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'pandaapi:read-selection') {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(async ([tab]) => {
        if (!tab?.id) {
          return { selectedText: '', selectionError: 'Não foi possível acessar a aba ativa.' }
        }

        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: readSelectionFromPage,
          })
          return { selectedText: result?.result ?? '' }
        } catch {
          return {
            selectedText: '',
            selectionError: 'Esta página não permite leitura da seleção. Tente colar o documento.',
          }
        }
      })
      .then(sendResponse)
      .catch((error) => sendResponse({
        selectedText: '',
        selectionError: error.message || 'Não foi possível ler a seleção da página.',
      }))
    return true
  }

  if (message?.type === 'pandaapi:validate-document') {
    pandaApi.validateDocument(message.document)
      .then((result) => sendResponse({ result }))
      .catch((error) => sendResponse({
        error: error.message || 'Ocorreu um erro ao consultar a PandaAPI.',
        status: error.status || 0,
      }))
    return true
  }

  if (message?.type === 'pandaapi:generate-document') {
    pandaApi.generateDocument(message.kind)
      .then((document) => sendResponse({ document }))
      .catch((error) => sendResponse({
        error: error.message || 'Ocorreu um erro ao gerar o documento.',
        status: error.status || 0,
      }))
    return true
  }

  return false
})
