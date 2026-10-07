# Política de privacidade — PandaAPI Validador

**Última atualização: 6 de outubro de 2026**

Esta política explica, em linguagem direta, quais dados a extensão trata e
quando eles são enviados. A extensão é uma ferramenta independente: **não é
um serviço da Receita Federal** e não consulta bases governamentais.

## O que a extensão faz — e o que não faz

Ao validar um CPF ou CNPJ, a extensão verifica apenas se os dígitos
verificadores correspondem ao algoritmo matemático do documento. Um resultado
positivo **não confirma** que o número foi emitido, está ativo, pertence a uma
pessoa ou empresa específica, ou está regular na Receita Federal. Não há
consulta à Receita Federal nem a qualquer cadastro oficial.

A geração cria números com formato e dígitos verificadores válidos para testes.
Como não consulta um cadastro de documentos emitidos, um número gerado pode
coincidir com um CPF ou CNPJ existente. Use esses valores somente em ambientes
de teste; não os use para identificar pessoas ou empresas, nem em produção.

## Quem opera o serviço

A extensão é mantida por Anderson Jader e se conecta à API PandaAPI, operada
pelo mesmo projeto, em `https://api.pandaapi.com.br`. A documentação pública
do projeto identifica Railway e Cloudflare entre os provedores de
infraestrutura; é preciso confirmar quais serviços processam cada requisição
na configuração de produção. A API e os provedores envolvidos recebem os
dados técnicos necessários para processar e proteger as conexões.

## Confirmação antes do primeiro uso

Na primeira abertura, a extensão mostra um aviso sobre a leitura da seleção e
da área de transferência e sobre o envio do documento à API. A extensão não lê
esses conteúdos nem inicia a validação antes de a pessoa clicar em
**Concordo e continuar**.

A confirmação fica salva localmente neste navegador como uma preferência
(`privacyConsentVersion`). Ela não contém CPF, CNPJ ou o texto da área de
transferência, não é sincronizada e pode ser removida pelo botão **Revogar** no
popup. Ao revogar, a extensão volta a pedir confirmação antes de ler dados.

## Dados tratados e finalidade

- **Seleção da página e área de transferência:** após a confirmação, quando o
  popup é aberto, a extensão tenta obter o texto selecionado na aba ativa. Se
  não identificar um CPF/CNPJ nesse texto, tenta ler a área de transferência.
  Essa leitura existe apenas para oferecer a validação do documento solicitado.
  O texto completo é analisado localmente para encontrar um número reconhecido;
  somente o CPF/CNPJ normalizado é enviado à API, não o restante da página ou
  da área de transferência.
- **CPF ou CNPJ para validação:** se a extensão reconhecer um número na seleção
  ou na área de transferência, envia-o automaticamente para validação. Também
  é possível digitá-lo e clicar em **Validar**. A extensão envia o número no
  corpo JSON, por HTTPS, a `POST /validate/cpf` ou `POST /validate/cnpj` da API
  PandaAPI.
- **Geração de documentos:** somente depois de escolher um tipo e clicar em
  **Gerar**, a extensão solicita à API um CPF (`GET /generate/cpf`), um CNPJ
  numérico (`GET /generate/cnpj/numeric`) ou um CNPJ alfanumérico
  (`GET /generate/cnpj/alphanumeric`). O resultado fica no popup enquanto ele
  está aberto. A área de transferência só é alterada após clicar em
  **Copiar**.
- **Token de sessão guest:** a API emite um token de autenticação com validade
  aproximada de cinco minutos. A extensão o mantém em `chrome.storage.session`
  e o usa somente para autenticar pedidos à API. Não o grava em armazenamento
  permanente.
- **Confirmação de privacidade:** a extensão mantém em `chrome.storage.local`
  apenas a versão do aviso aceita, para não exibi-lo a cada abertura.
- **Dados técnicos da conexão:** durante a comunicação, a API e os serviços
  de infraestrutura utilizados podem processar endereço IP, horário,
  navegador e informações relacionadas à requisição, necessários à conexão,
  ao controle de requisições e à segurança do serviço.

## Armazenamento, compartilhamento e retenção

A extensão não cria histórico de consultas, não envia os documentos a serviços
de publicidade ou analytics e não mantém uma cópia persistente dos números
validados ou gerados. O texto e o resultado permanecem temporariamente na
memória do popup; fechá-lo encerra essa apresentação. Um documento gerado só é
copiado para a área de transferência se a pessoa clicar em **Copiar**.

Na revisão do código público da API, os endpoints de validação verificam o
documento e retornam o resultado, sem gravá-lo em banco de dados como parte
dessa operação. A validação usa `POST` e coloca o número no corpo JSON, não no
caminho da URL.

Na configuração verificada em 6 de outubro de 2026, os corpos JSON das requisições de validação não são registrados em logs pela aplicação PandaAPI. A aplicação também não mantém um histórico dos documentos consultados.

Os serviços de infraestrutura utilizados pela PandaAPI, como Railway e Cloudflare, podem processar e registrar dados técnicos relacionados às requisições, como endereço IP, horário, navegador e informações de conexão, conforme suas respectivas configurações, recursos de observabilidade e políticas de retenção.

Esses dados não são utilizados pela PandaAPI para criar um histórico de documentos consultados. Esta descrição corresponde à configuração verificada nessa data e deverá ser atualizada caso a infraestrutura, as configurações de logging ou as ferramentas de diagnóstico sejam alteradas.

## Segurança

As chamadas da extensão à API usam HTTPS. A extensão solicita apenas acesso à
aba ativa, às funções de leitura/cópia da área de transferência, ao
armazenamento necessário à sessão e à confirmação local, e ao domínio da API.
Ela não instala um script permanente em todas as páginas. A leitura da
seleção ocorre após a confirmação e quando a pessoa abre a extensão.

## Como interromper o uso e entrar em contato

Não aceite o aviso para impedir a leitura da seleção e da área de
transferência. Depois de aceitar, use **Revogar** para retirar a confirmação e
impedir novas leituras até aceitá-la novamente. Fechar ou desinstalar a
extensão também interrompe o uso; o navegador remove os dados de armazenamento
da extensão ao desinstalá-la.

Para suporte e solicitações de privacidade, escreva para
[suportepandaapi@gmail.com](mailto:suportepandaapi@gmail.com). **Não envie CPF,
CNPJ ou outros documentos pessoais por e-mail e não os publique em issues
públicas.** Use o [repositório da extensão no GitHub](https://github.com/ajayxr/PandaAPI.extension)
para relatar problemas técnicos sem incluir dados pessoais.

## Alterações desta política

Esta política deve ser atualizada se mudar o comportamento da extensão, os
dados enviados ou a infraestrutura da API. A data no início indica a revisão
mais recente.
