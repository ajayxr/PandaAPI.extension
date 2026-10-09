# PandaAPI — extensão de navegador

Extensão Manifest V3 para Chrome e Edge que confere os dígitos verificadores de
CPF e CNPJ e gera documentos para testes por meio da API PandaAPI.

**A validação é somente matemática. A extensão não consulta a Receita Federal
nem confirma existência, situação cadastral, titularidade ou regularidade do
documento.** Um dígito verificador correto não prova que o documento foi
emitido ou está ativo.

A interface do popup usa Vue 3; o service worker faz a autenticação e as
requisições à API.

## Desenvolvimento

Requer Node.js 20.19+ ou 22.12+.

```sh
npm install
npm test
npm run build
```

No PowerShell, se a política de execução bloquear `npm`, use `npm.cmd` no lugar
de `npm` nesses comandos.

Para executar os testes, compilar e conferir o pacote em um único comando:

```sh
npm run verify
```

Consulte [PRIVACY.md](./PRIVACY.md) e [STORE_LISTING.md](./STORE_LISTING.md)
para a política de privacidade e a lista de preparação da publicação.
Se mudar de forma relevante quais dados são lidos, enviados ou como são usados,
atualize o aviso e incremente `PRIVACY_CONSENT_VERSION` em `src/App.vue` para
solicitar uma nova confirmação.

No Chrome ou Edge, abra `chrome://extensions` ou `edge://extensions`, habilite
o modo de desenvolvedor e escolha **Carregar sem compactação**, apontando para
a pasta `dist`. Depois de alterar o código, execute `npm run build` novamente
e recarregue a extensão na página de extensões. `npm run dev` mantém o build
atualizado enquanto os arquivos mudam; o navegador ainda precisa ser recarregado.

## Como funciona

1. Na primeira utilização, a extensão explica quais dados lê e envia. Nada é
   lido da página ou da área de transferência antes de você clicar em
   **Concordo e continuar**. A confirmação fica salva neste navegador; você
   pode revogá-la pelo botão **Revogar**.
2. Depois da confirmação, abrir o popup ou usar `Alt+A` tenta ler a seleção da
   aba ativa e, se ela não contiver um documento reconhecido, o texto copiado.
   Se encontrar um CPF/CNPJ reconhecido, a extensão o envia automaticamente
   para validação. Você também pode digitar e clicar em **Validar**.
3. O popup identifica CPF numérico ou CNPJ numérico/alfanumérico e normaliza a
   pontuação.
4. O service worker solicita um token em `POST /auth/guest` e envia o documento
   em JSON para `POST /validate/cpf` (`{"cpf":"..."}`) ou
   `POST /validate/cnpj` (`{"cnpj":"..."}`).
5. O token fica em `chrome.storage.session`, apenas durante a sessão do
   navegador. A API define validade de cinco minutos; a extensão renova o token
   antes de expirar e tenta uma vez novamente se a API responder `401`.
6. A aba **Gerar para testes** solicita um CPF, CNPJ numérico ou CNPJ
   alfanumérico somente quando a pessoa clica em **Gerar**. O valor pode ser
   copiado pelo botão **Copiar**. Como a geração verifica apenas os dígitos,
   um resultado pode coincidir com um documento existente; use somente em
   testes, nunca para identificar alguém ou em produção.

## Permissões

- `activeTab` e `scripting`: ler somente a seleção da aba ativa após abrir a
  extensão ou usar `Alt+Q`, sem injetar scripts continuamente nas páginas.
- `clipboardRead`: permitir a validação quando o documento foi copiado, mas
  não selecionado no momento.
- `clipboardWrite`: copiar o documento gerado somente depois que a pessoa
  clicar em **Copiar**, e copiar somente letras e números do texto selecionado, sem
  pontuação, quando usar `Alt+Q`.
- `storage`: manter o token guest apenas em armazenamento de sessão.
- `storage.local`: lembrar neste navegador a confirmação de privacidade e a
  opção de copiar sem máscara. Esse estado não sincroniza nem contém documentos.
- Acesso de host somente a `https://api.pandaapi.com.br/*`.

O navegador pode impedir a leitura em páginas internas ou especiais. Nesses
casos, copie o documento e cole no campo do popup.

Os documentos consultados não são adicionados a um histórico pela extensão. A
API recebe o número no corpo de uma requisição HTTPS `POST`; consulte
[PRIVACY.md](./PRIVACY.md) para os dados tratados pela API e a informação
confirmada pelo responsável sobre o processamento de dados técnicos e a
retenção na configuração atual. O texto completo da página e da área de
transferência é analisado localmente; somente o documento identificado é
enviado à API.

## Atalho

Os atalhos são `Alt+A`, que valida o documento selecionado ou copiado, e
`Alt+Q`, que copia somente letras e números do texto selecionado, sem pontuação.
Ambos exigem a
confirmação de privacidade. O checkbox **Copiar sem máscara**, no rodapé do
popup, faz os botões **Copiar** da validação e da geração copiarem sem pontuação.

O Chrome exige `Ctrl` ou `Alt` nos atalhos de
extensões, por isso `Shift+C`, `Ctrl+V` e `Ctrl+Z` não podem ser registrados
como atalhos da extensão. Para personalizar, abra
`chrome://extensions/shortcuts` ou `edge://extensions/shortcuts`.
