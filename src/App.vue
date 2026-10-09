<script setup>
import { onMounted, ref, watch } from 'vue'
import { formatBrazilianDocument, parseBrazilianDocument } from './document.js'
import { PRIVACY_CONSENT_KEY, PRIVACY_CONSENT_VERSION } from './privacy.js'

const REMOVE_FORMATTING_KEY = 'removeFormattingOnCopy'

const mode = ref('validate')
const hasPrivacyConsent = ref(false)
const consentLoading = ref(true)
const consentSaving = ref(false)
const consentError = ref('')
const documentInput = ref('')
const status = ref('idle')
const message = ref('')
const resultDocument = ref('')
const selectionError = ref('')
const generationKind = ref('cpf')
const generationStatus = ref('idle')
const generatedDocument = ref('')
const generationMessage = ref('')
const copied = ref(false)
const resultCopied = ref(false)
const removeFormattingOnCopy = ref(false)

const isLoading = ref(false)

watch(removeFormattingOnCopy, (value) => {
  chrome.storage.local.set({ [REMOVE_FORMATTING_KEY]: value })
})

async function validate() {
  if (isLoading.value) return

  const document = parseBrazilianDocument(documentInput.value)
  if (!document) {
    status.value = 'error'
    message.value = 'Digite um CPF com 11 dígitos ou um CNPJ com 14 caracteres.'
    resultDocument.value = ''
    return
  }

  isLoading.value = true
  status.value = 'loading'
  message.value = ''
  resultDocument.value = formatBrazilianDocument(document)
  resultCopied.value = false

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'pandaapi:validate-document',
      document,
    })

    if (response?.error) {
      status.value = 'error'
      message.value = response.error
      return
    }

    status.value = response.result.valid ? 'valid' : 'invalid'
    message.value = response.result.valid
      ? `${document.type.toUpperCase()}: dígitos verificadores conferem.`
      : `${document.type.toUpperCase()}: dígitos verificadores não conferem.`
  } catch {
    status.value = 'error'
    message.value = 'Não foi possível iniciar a validação. Reabra a extensão e tente novamente.'
  } finally {
    isLoading.value = false
  }
}

async function generate() {
  if (isLoading.value) return

  isLoading.value = true
  generationStatus.value = 'loading'
  generationMessage.value = ''
  generatedDocument.value = ''
  copied.value = false

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'pandaapi:generate-document',
      kind: generationKind.value,
    })

    if (response?.error) {
      generationStatus.value = 'error'
      generationMessage.value = response.error
      return
    }

    generatedDocument.value = formatBrazilianDocument(response.document)
    generationStatus.value = 'success'
    generationMessage.value = 'Documento gerado para uso em testes.'
  } catch {
    generationStatus.value = 'error'
    generationMessage.value = 'Não foi possível iniciar a geração. Reabra a extensão e tente novamente.'
  } finally {
    isLoading.value = false
  }
}

async function copyGeneratedDocument() {
  try {
    const textToCopy = removeFormattingOnCopy.value
      ? generatedDocument.value.replace(/[\s.,\/-]/g, '')
      : generatedDocument.value
    await navigator.clipboard.writeText(textToCopy)
    copied.value = true
    generationMessage.value = 'Copiado para a área de transferência.'
  } catch {
    generationMessage.value = 'Não foi possível copiar. Selecione e copie o documento.'
  }
}
async function copyResultDocument() {
  const parsed = parseBrazilianDocument(resultDocument.value)
  if (!parsed) return

  try {
    await navigator.clipboard.writeText(
      removeFormattingOnCopy.value ? parsed.digits : resultDocument.value,
    )
    resultCopied.value = true
  } catch {
    message.value = 'Não foi possível copiar. Selecione e copie o documento.'
  }
}

async function acceptPrivacyDisclosure() {
  if (consentSaving.value) return

  consentSaving.value = true
  consentError.value = ''
  try {
    await chrome.storage.local.set({
      [PRIVACY_CONSENT_KEY]: PRIVACY_CONSENT_VERSION,
    })
    hasPrivacyConsent.value = true
    await loadSelectionOrClipboard()
  } catch {
    consentError.value = 'Não foi possível salvar sua confirmação. Tente novamente.'
  } finally {
    consentSaving.value = false
  }
}

async function revokePrivacyConsent() {
  try {
    await chrome.storage.local.remove(PRIVACY_CONSENT_KEY)
    hasPrivacyConsent.value = false
    mode.value = 'validate'
    documentInput.value = ''
    status.value = 'idle'
    message.value = ''
    resultDocument.value = ''
    generatedDocument.value = ''
    generationStatus.value = 'idle'
    generationMessage.value = ''
    selectionError.value = ''
  } catch {
    consentError.value = 'Não foi possível revogar a confirmação. Tente novamente.'
  }
}

async function loadSelectionOrClipboard() {
  let selectedText = ''

  try {
    const response = await chrome.runtime.sendMessage({ type: 'pandaapi:read-selection' })
    selectedText = response?.selectedText?.trim() ?? ''
    selectionError.value = response?.selectionError ?? ''
  } catch {
    selectionError.value = 'Não foi possível ler a seleção desta página.'
  }

  if (!parseBrazilianDocument(selectedText)) {
    try {
      selectedText = (await navigator.clipboard.readText()).trim()
    } catch {
      if (!selectionError.value) {
        selectionError.value = 'Selecione um documento ou permita o acesso à área de transferência.'
      }
    }
  }

  if (selectedText) {
    documentInput.value = selectedText
    await validate()
  } else if (selectionError.value) {
    status.value = 'error'
    message.value = selectionError.value
  }
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get([PRIVACY_CONSENT_KEY, REMOVE_FORMATTING_KEY])
    hasPrivacyConsent.value = stored[PRIVACY_CONSENT_KEY] === PRIVACY_CONSENT_VERSION
    removeFormattingOnCopy.value = stored[REMOVE_FORMATTING_KEY] === true
  } catch {
    consentError.value = 'Não foi possível verificar a confirmação de privacidade.'
  } finally {
    consentLoading.value = false
  }

  if (hasPrivacyConsent.value) await loadSelectionOrClipboard()
}

onMounted(initialize)
</script>

<template>
  <main class="popup">
    <header class="header">
      <img class="brand-mark" src="/icons/panda.svg" alt="" />
      <div class="brand-copy">
        <p class="eyebrow">PANDAAPI</p>
        <h1>Validador e gerador de CPF/CNPJ</h1>
      </div>
      <span class="session-pill"><span></span> guest · 5 min</span>
    </header>

    <section v-if="consentLoading" class="consent-loading" aria-live="polite">
      <div class="loading-indicator" aria-hidden="true"></div>
      <p>Preparando a extensão…</p>
    </section>

    <section
      v-else-if="!hasPrivacyConsent"
      class="privacy-consent"
      aria-labelledby="privacy-title"
    >
      <p class="eyebrow">ANTES DE COMEÇAR</p>
      <h2 id="privacy-title">Antes de usar</h2>
      <p class="privacy-lead">
        A ferramenta confere somente os dígitos verificadores de CPF e CNPJ.
        <strong>Não consulta a Receita Federal</strong> nem verifica existência,
        situação cadastral ou titularidade do documento.
      </p>
      <div class="privacy-details">
        <p>
          Depois da sua confirmação, ao abrir a extensão a ferramenta poderá
          ler o texto selecionado e, se necessário, a área de transferência. Um
          documento reconhecido será validado automaticamente. Somente o
          CPF/CNPJ identificado — e não o restante da página ou do conteúdo da
          área de transferência — é enviado por HTTPS à API PandaAPI. Se você
          digitar um número, ele só será enviado após o clique em
          <strong>Validar</strong>.
        </p>
        <p>
          A geração envia uma solicitação à API somente quando você clica em
          <strong>Gerar</strong>. Os documentos gerados são destinados a testes,
          podem coincidir com números existentes e não devem ser utilizados
          para identificação ou em produção.
        </p>
        <p>
          Um documento gerado só é copiado quando você clica em
          <strong>Copiar</strong>.
        </p>
        <p>
          A extensão não mantém histórico local das consultas ou dos documentos
          gerados. Durante a comunicação, a API e os serviços de infraestrutura
          utilizados podem processar dados técnicos da conexão, como endereço
          IP, horário, navegador e informações relacionadas à requisição. A
          PandaAPI não utiliza esses dados para criar um histórico de documentos
          consultados. Consulte a política de privacidade completa para obter
          informações sobre tratamento, armazenamento e retenção de dados.
        </p>
      </div>
      <a
        class="privacy-link"
        href="https://github.com/ajayxr/PandaAPI.extension/blob/main/PRIVACY.md"
        target="_blank"
        rel="noreferrer"
      >
        Ler política de privacidade
      </a>
      <p v-if="consentError" class="consent-error" role="alert">{{ consentError }}</p>
      <button
        class="consent-button"
        type="button"
        :disabled="consentSaving"
        @click="acceptPrivacyDisclosure"
      >
        {{ consentSaving ? 'Salvando…' : 'Concordo e continuar' }}
      </button>
      <p class="consent-note">
        Sua confirmação fica salva neste navegador. Você pode revogá-la pelo
        botão Revogar, dentro da extensão.
      </p>
    </section>

    <template v-else>
    <nav class="mode-switch" aria-label="Ferramenta">
      <button
        type="button"
        :class="{ active: mode === 'validate' }"
        :aria-pressed="mode === 'validate'"
        @click="mode = 'validate'"
      >
        Validar
      </button>
      <button
        type="button"
        :class="{ active: mode === 'generate' }"
        :aria-pressed="mode === 'generate'"
        @click="mode = 'generate'"
      >
        Gerar para testes
      </button>
    </nav>

    <template v-if="mode === 'validate'">
    <section class="form-section" aria-labelledby="document-label">
      <label id="document-label" for="document">CPF ou CNPJ</label>
      <div class="input-row">
        <input
          id="document"
          v-model="documentInput"
          type="text"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="CPF ou CNPJ"
          @keydown.enter="validate"
        />
        <button
          class="validate-button"
          type="button"
          :disabled="isLoading"
          @click="validate"
        >
          {{ isLoading ? 'Validando…' : 'Validar' }}
        </button>
      </div>
      <p class="field-hint">
        Confere somente os dígitos verificadores. Não consulta a Receita Federal.
      </p>
    </section>

    <section
      class="result-card"
      :class="`result-${status}`"
      aria-live="polite"
      aria-atomic="true"
    >
      <template v-if="status === 'idle'">
        <div class="result-icon" aria-hidden="true">↗</div>
        <div>
          <p class="result-title">Pronto para validar</p>
          <p class="result-description">Selecione ou copie um documento para começar.</p>
        </div>
      </template>
      <template v-else-if="status === 'loading'">
        <div class="loading-indicator" aria-hidden="true"></div>
        <div>
          <p class="result-title">Consultando a PandaAPI</p>
          <p class="result-description">{{ resultDocument }}</p>
        </div>
      </template>
      <template v-else>
        <div class="result-icon" aria-hidden="true">
          {{ status === 'valid' ? '✓' : status === 'invalid' ? '!' : '×' }}
        </div>
        <div class="result-copy">
          <p class="result-title">{{ message }}</p>
          <p v-if="resultDocument" class="result-description">{{ resultDocument }}</p>
        </div>
        <button
          v-if="status === 'valid' || status === 'invalid'"
          class="copy-button"
          type="button"
          @click="copyResultDocument"
        >
          {{ resultCopied ? 'Copiado' : 'Copiar' }}
        </button>
      </template>
    </section>
    </template>

    <template v-else>
      <section class="form-section" aria-labelledby="generation-label">
        <label id="generation-label" for="generation-kind">Tipo de documento</label>
        <div class="input-row">
          <select id="generation-kind" v-model="generationKind" :disabled="isLoading">
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ numérico</option>
            <option value="cnpj-alphanumeric">CNPJ com letras</option>
          </select>
          <button
            class="validate-button"
            type="button"
            :disabled="isLoading"
            @click="generate"
          >
            {{ isLoading ? 'Gerando…' : 'Gerar' }}
          </button>
        </div>
        <p class="field-hint">
          Sem consulta à Receita Federal; pode coincidir com documento real.
        </p>
      </section>

      <section
        class="result-card"
        :class="`result-${generationStatus}`"
        aria-live="polite"
        aria-atomic="true"
      >
        <template v-if="generationStatus === 'loading'">
          <div class="loading-indicator" aria-hidden="true"></div>
          <div>
            <p class="result-title">Gerando com a PandaAPI</p>
            <p class="result-description">Só fazemos a consulta quando você solicita.</p>
          </div>
        </template>
        <template v-else-if="generatedDocument">
          <div class="result-icon" aria-hidden="true">✓</div>
          <div class="result-copy generated-copy">
            <p class="result-title">{{ generationMessage }}</p>
            <p class="generated-value">{{ generatedDocument }}</p>
            <p class="result-description">
              Pode coincidir com documento real. Use somente em testes.
            </p>
          </div>
          <button
            class="copy-button"
            type="button"
            :aria-label="copied ? 'Documento copiado' : 'Copiar documento'"
            @click="copyGeneratedDocument"
          >
            {{ copied ? 'Copiado' : 'Copiar' }}
          </button>
        </template>
        <template v-else-if="generationStatus === 'error'">
          <div class="result-icon" aria-hidden="true">×</div>
          <div class="result-copy">
            <p class="result-title">{{ generationMessage }}</p>
          </div>
        </template>
        <template v-else>
          <div class="result-icon" aria-hidden="true">↗</div>
          <div>
            <p class="result-title">Pronto para gerar</p>
            <p class="result-description">Escolha um tipo e gere sob demanda.</p>
          </div>
        </template>
      </section>
    </template>

    <footer class="footer">
      <p>Sem histórico · geração sob demanda.</p>
      <div class="footer-actions">
        <label class="formatting-option">
          <input v-model="removeFormattingOnCopy" type="checkbox" />
          Copiar sem máscara
        </label>
        <button class="privacy-reset" type="button" @click="revokePrivacyConsent">
          Revogar
        </button>
        <div class="shortcut" aria-label="Atalho Alt mais A">
          <kbd>Alt</kbd><span>+</span><kbd>A</kbd>
        </div>
        <div class="shortcut" aria-label="Atalho Alt mais Q">
          <kbd>Alt</kbd><span>+</span><kbd>Q</kbd>
        </div>
      </div>
    </footer>
    <p v-if="consentError" class="consent-error footer-error" role="alert">
      {{ consentError }}
    </p>
    </template>
  </main>
</template>
