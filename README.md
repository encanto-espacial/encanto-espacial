# Encanto Espacial · Estoque e Vendas

Sistema da loja **Encanto Espacial**, de lembranças de Colares (Pará). Ele controla o estoque, registra as vendas, cuida da consignação e emite relatórios.

Funciona no **celular, tablet e notebook**, inclusive **sem internet**. Os dados sincronizam sozinhos quando a conexão volta. A hospedagem é **gratuita**, com GitHub Pages e Firebase no plano Spark.

## Funcionalidades

| Tela | O que faz | Sócio | Vendedor |
|---|---|:-:|:-:|
| **Painel de vendas** | Faturamento, lucro, margem, ticket médio, gráficos por dia, pagamento, categoria e horário; mais vendidos; estoque baixo; consignação | ✅ | – |
| **Vender (PDV)** | Leitura pela câmera ou leitor USB, busca por nome, carrinho, desconto (com limite para vendedor), Pix, dinheiro (com troco), débito e crédito; comprovante impresso ou por WhatsApp | ✅ | ✅ |
| **Vendas** | Vendas do dia com totais por forma de pagamento; detalhes; reimpressão; **cancelamento** (devolve ao estoque) | ✅ todas | ✅ só as próprias |
| **Produtos** | Cadastro com **custo, preço de venda, margem e markup**; **grade de variações** (tipo × cor × tamanho), cada uma com código próprio; código EAN-13 gerado automaticamente; importação e exportação em Excel | ✅ | consulta (sem custo) |
| **Entrada e saída** | Entrada e baixa por leitura de código (compra, consignação, perda, quebra, brinde…), com motivo e documento; **inventário**: contagem com leitor e ajuste automático das diferenças | ✅ | ✅ |
| **Etiquetas** | Etiquetas com código de barras, nome e preço para **impressora térmica** (tamanho e colunas configuráveis) | ✅ | ✅ |
| **Consignação** | Cadastro de artesãos e parceiros; **acerto de contas** por período (PDF, Excel, WhatsApp); registro de pagamentos e histórico | ✅ | – |
| **Relatórios** | Vendas, curva ABC por produto, categorias, vendedores, fechamento de caixa, estoque valorizado, reposição, produtos parados, movimentações, consignação e cancelamentos, em **PDF, Excel ou impressão** | ✅ | – |
| **Log de atividades** | Quem fez o quê e quando: acessos, vendas, cancelamentos, descontos, alterações de preço/custo, entradas/saídas, inventários, usuários, exportações; filtro de ações que merecem atenção; PDF/Excel | ✅ | – |
| **Usuários** | Aprovação de contas e perfis (sócio ou vendedor); ativar e desativar | ✅ | – |
| **Configurações** | Dados da loja, categorias, tamanhos, limite de desconto, backup e restauração, dados de exemplo | ✅ | – |

**Segurança:** o custo dos produtos fica numa coleção separada que só os sócios podem ler. Todas as permissões são verificadas no servidor pelas regras do arquivo `firestore.rules`.

---

## 1. Testar agora (modo demonstração)

Sem nenhuma configuração, o sistema roda em **modo demonstração** e salva os dados só no navegador em uso.

1. Abra o site publicado, ou rode localmente com `python3 -m http.server` nesta pasta e acesse `http://localhost:8000`.
2. Toque em **Criar conta**. O primeiro usuário vira **sócio administrador**.
3. Em **Configurações**, clique em **Carregar dados de exemplo** para ver o painel funcionando.

> A câmera só funciona em `https://` ou em `localhost`.

## 2. Publicar gratuitamente no GitHub Pages

1. No repositório do GitHub, abra **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, depois a branch `main` e a pasta `/ (root)`, e clique em **Save**.
3. Em cerca de 1 minuto o app fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## 3. Ligar a sincronização na nuvem (Firebase, gratuito)

É isso que permite usar vários aparelhos ao mesmo tempo e acessar de qualquer lugar.

1. Acesse <https://console.firebase.google.com> com uma conta Google da loja e clique em **Adicionar projeto** (por exemplo, `encanto-espacial`). O Google Analytics pode ficar desativado.
2. Ative o **Authentication**: menu **Criação → Authentication → Vamos começar → E-mail/senha → Ativar → Salvar**.
   - Na aba **Configurações → Domínios autorizados**, adicione `SEU-USUARIO.github.io`.
3. Ative o **Firestore**: menu **Criação → Firestore Database → Criar banco de dados**.
   - Local: `southamerica-east1 (São Paulo)`.
   - Comece no **modo de produção**.
4. Configure as **regras**: na aba **Regras** do Firestore, apague o conteúdo, cole todo o arquivo [`firestore.rules`](firestore.rules) e clique em **Publicar**.
5. Registre o app Web: em **Configurações do projeto** (engrenagem) → **Seus apps** → ícone **`</>`**, dê um nome e clique em **Registrar app**. Copie o objeto `firebaseConfig` que aparece.
6. Cole a configuração no arquivo [`js/config.js`](js/config.js), substituindo `null`:
   ```js
   export const FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "encanto-espacial.firebaseapp.com",
     projectId: "encanto-espacial",
     storageBucket: "encanto-espacial.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Esses valores **não são senhas**. A proteção vem das regras e do login.
7. Faça o commit. Em seguida, abra o app e **crie a conta do primeiro sócio**.
8. Os demais sócios e vendedores fazem o mesmo: **Criar conta**, informar o nome e aguardar a liberação em **Usuários**.

**Para levar os dados do modo demonstração para a nuvem:** antes do passo 6, use **Configurações → Exportar backup**. Depois de conectado, use **Importar backup**.

### Limites do plano gratuito

Por dia, o plano gratuito permite cerca de 50 mil leituras e 20 mil gravações, com 1 GB de armazenamento. Cada venda gera em média de 3 a 7 gravações, e o app guarda os dados no aparelho para economizar leituras. Uma loja com centenas de vendas por dia fica com folga.

## 4. Como funciona offline

- Os arquivos do app ficam guardados no aparelho, e os dados ficam numa cópia local mantida pelo Firestore.
- Sem internet, dá para vender, dar entrada e baixa e imprimir etiquetas normalmente. O selo no topo mostra **Offline · N pendente(s)**.
- Quando a internet volta, tudo é enviado automaticamente. O estoque usa incrementos (+/−), então vendas feitas em aparelhos diferentes ao mesmo tempo não se sobrescrevem.
- O **primeiro login** em cada aparelho precisa de internet.

## 5. Dicas de uso

- **Instalar como app:** no Android (Chrome), use o menu ⋮ e escolha *Instalar app*. No iPhone (Safari), use *Compartilhar* e escolha *Adicionar à Tela de Início*.
- **Leitor USB/Bluetooth:** funciona como teclado. Clique no campo de código e leia.
- **Produtos sem código de barras:** use **Gerar** no cadastro. Os códigos internos começam com `2`, faixa reservada para uso da própria loja, e então é só imprimir as etiquetas.
- **Impressora térmica de etiquetas:** em **Etiquetas**, configure largura × altura (por exemplo, 50 × 30 mm) e o número de colunas do rolo. Na janela de impressão, escolha a impressora, margens *Nenhuma* e escala 100%.
- **Consignação:** no cadastro do produto, marque *Consignado* e escolha o artesão. O "preço de custo" vira o **valor de repasse** por unidade. O acerto calcula sozinho quanto pagar no período.
- **Cadastro em massa:** em **Produtos**, use **Exportar** para baixar a planilha modelo, preencha no Excel e depois use **Importar planilha**.
- **Backup:** exporte semanalmente em **Configurações** e guarde no Google Drive.
- **Atualizar o app:** ao publicar uma nova versão, altere `VERSAO` em `sw.js`.

## Estrutura

```
index.html            página única (PWA)
manifest.webmanifest  instalação como app
sw.js                 cache offline
firestore.rules       regras de segurança do banco
css/app.css           visual (cores da logo)
js/config.js          ← configuração do Firebase
js/app.js             login, perfis, menu e rotas
js/state.js           dados sincronizados e regras de negócio (venda, movimentos)
js/store/             armazenamento: firebase.js (nuvem) e local.js (demonstração)
js/views/             telas
vendor/               bibliotecas (Firebase, leitor de código, gráficos, PDF, Excel)
```

Sem etapa de build: são arquivos estáticos em HTML, CSS e JavaScript. As bibliotecas ficam na pasta `vendor/` para funcionar offline.

## Próximos passos sugeridos

- Emissão de **NFC-e** (exige certificado digital e integração com a SEFAZ-PA, normalmente por um serviço pago).
- Cadastro de **clientes** e programa de fidelidade.
- **Fotos** dos produtos (Firebase Storage).
- Integração com maquininha ou Pix com QR dinâmico.
- Fechamento de caixa com sangria e suprimento.
