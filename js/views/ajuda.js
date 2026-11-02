// Instrutivo de uso do app (consulta dentro do próprio sistema).
import { isSocio, state } from '../state.js';
import { $, $$, esc, casaBusca, debounce } from '../util.js';
import { ic } from '../icones.js';

// Cada seção: id (igual ao nome da tela, quando houver), título, ícone, se é só para sócios e o conteúdo.
const SECOES = [
  {
    id: 'inicio', t: 'Primeiros passos', i: 'ajuda', html: `
    <h4>Entrar no sistema</h4>
    <ol>
      <li>Abra o endereço do app no navegador do celular, tablet ou notebook.</li>
      <li>Na primeira vez, toque em <b>Criar conta</b>, informe seu e-mail e uma senha (mínimo de 6 caracteres) e depois o seu nome.</li>
      <li>Aguarde um sócio liberar seu acesso. A tela de espera atualiza sozinha quando o acesso é liberado.</li>
      <li>Nas próximas vezes, basta entrar com e-mail e senha. Esqueceu a senha? Digite o e-mail e toque em <b>Esqueci a senha</b>.</li>
    </ol>
    <h4>Instalar como aplicativo</h4>
    <ul>
      <li><b>Android (Chrome):</b> menu ⋮ → <i>Instalar app</i> ou <i>Adicionar à tela inicial</i>.</li>
      <li><b>iPhone/iPad (Safari):</b> botão Compartilhar → <i>Adicionar à Tela de Início</i>.</li>
      <li><b>Notebook (Chrome/Edge):</b> ícone de instalar na barra de endereço.</li>
    </ul>
    <h4>Perfis de acesso</h4>
    <ul>
      <li><b>Vendedor:</b> vende, consulta produtos (sem ver custo e lucro), dá entrada e baixa de mercadoria, faz inventário, imprime etiquetas e vê apenas as próprias vendas.</li>
      <li><b>Sócio:</b> acesso total, incluindo painel, relatórios, custos, consignação, cancelamentos, usuários e configurações.</li>
    </ul>
    <h4>Navegação</h4>
    <p>No celular, toque em ${ic('menu')} (canto superior esquerdo) para abrir o menu. O botão <b>?</b> no topo abre a ajuda da tela em que você está.</p>`
  },
  {
    id: 'offline', t: 'Funcionamento sem internet', i: 'alerta', html: `
    <p>O app continua funcionando sem internet: você pode vender, dar entrada e baixa e imprimir etiquetas normalmente.</p>
    <ul>
      <li>O selo no topo da tela mostra a situação: <span class="status">Online</span> sincronizado, <span class="status off">Offline · 3 pendente(s)</span> operações guardadas no aparelho.</li>
      <li>Quando a internet volta, tudo é enviado automaticamente. <b>Não feche a conta (sair)</b> enquanto houver pendências.</li>
      <li>O estoque é atualizado por somas e subtrações, então vendas feitas ao mesmo tempo em aparelhos diferentes não se perdem.</li>
      <li>O <b>primeiro login</b> em cada aparelho precisa de internet.</li>
    </ul>`
  },
  {
    id: 'pdv', t: 'Vender (PDV)', i: 'carrinho', html: `
    <h4>Fazer uma venda</h4>
    <ol>
      <li>Abra <b>Vender (PDV)</b>.</li>
      <li>Adicione os produtos de uma destas formas:
        <ul>
          <li><b>Câmera:</b> toque em <b>Câmera</b> e aponte para o código de barras. Pode ler vários produtos em sequência; toque em <b>Concluir</b> no final.</li>
          <li><b>Leitor USB/Bluetooth:</b> clique no campo de busca e leia o código.</li>
          <li><b>Pelo nome:</b> digite parte do nome (ex.: "caneca azul") e toque no produto na lista.</li>
        </ul></li>
      <li>Ajuste a quantidade com <b>−</b> e <b>+</b> ou remova o item com ${ic('lixo')}.</li>
      <li>Se houver desconto, informe o valor em <b>R$</b> ou em <b>%</b>.</li>
      <li>Escolha a forma de pagamento: <b>Pix</b>, <b>Dinheiro</b>, <b>Débito</b> ou <b>Crédito</b>. No dinheiro, informe o valor recebido para ver o troco.</li>
      <li>Toque em <b>Finalizar venda</b>. O estoque é baixado automaticamente.</li>
      <li>Se o cliente quiser, toque em <b>Imprimir</b> ou <b>WhatsApp</b> para enviar o comprovante.</li>
    </ol>
    <h4>Bom saber</h4>
    <ul>
      <li>O carrinho fica salvo no aparelho: se a tela fechar sem querer, os itens continuam lá.</li>
      <li>O aviso <span class="tag alerta">estoque insuficiente</span> não impede a venda, mas indica que a contagem do sistema está diferente da prateleira. Avise um sócio.</li>
      <li>O vendedor tem um <b>limite de desconto</b> definido pelos sócios (padrão 10%). Acima disso, peça para um sócio finalizar a venda.</li>
      <li><b>Sócios:</b> com dois cliques sobre um item do carrinho é possível alterar o preço unitário apenas naquela venda.</li>
      <li>O comprovante <b>não é nota fiscal</b>.</li>
    </ul>`
  },
  {
    id: 'vendas', t: 'Vendas do dia', i: 'recibo', html: `
    <ul>
      <li>Mostra as vendas do dia escolhido, com totais por forma de pagamento e ticket médio. Use o campo <b>Dia</b> para ver outras datas.</li>
      <li>Vendedores veem apenas as próprias vendas; sócios veem todas.</li>
      <li>Toque em uma venda para ver os itens, reimprimir ou reenviar o comprovante por WhatsApp.</li>
    </ul>
    <h4>Cancelar uma venda (somente sócios)</h4>
    <ol>
      <li>Abra a venda e toque em <b>Cancelar venda</b>.</li>
      <li>Informe o motivo. Os itens voltam automaticamente para o estoque.</li>
      <li>A venda continua no histórico marcada como <span class="tag perigo">Cancelada</span> e aparece no relatório de cancelamentos.</li>
    </ol>
    <p class="dica">Para "trocar" um produto: cancele a venda (ou dê entrada como "Devolução de cliente") e faça uma nova venda.</p>`
  },
  {
    id: 'produtos', t: 'Produtos', i: 'caixa', html: `
    <h4>Consultar</h4>
    <ul>
      <li>Busque por nome, categoria, cor, tamanho ou código, ou use ${ic('camera')} para ler o código.</li>
      <li>Filtre por <b>Categoria</b> e <b>Situação</b> (estoque baixo, sem estoque, consignados, inativos).</li>
      <li>A cor do estoque indica: <span class="tag ok">ok</span> <span class="tag alerta">abaixo do mínimo</span> <span class="tag perigo">zerado</span>.</li>
    </ul>
    <div data-socio>
    <h4>Cadastrar um produto (sócios)</h4>
    <ol>
      <li>Toque em <b>Novo produto</b>.</li>
      <li>Preencha <b>nome</b>, <b>categoria</b>, <b>preço de custo</b> e <b>preço de venda</b>. O sistema mostra lucro, margem e markup.</li>
      <li>Defina o <b>estoque mínimo</b>: abaixo dele o produto aparece nos alertas de reposição.</li>
      <li>Em <b>Código de barras</b>: leia o código da embalagem, digite, ou toque em <b>Gerar</b> se o produto não tiver código (depois imprima a etiqueta).</li>
      <li>Informe o <b>estoque inicial</b> e toque em <b>Salvar</b>.</li>
    </ol>
    <h4>Produtos com variações (camisas, bonés…)</h4>
    <ol>
      <li>Em <b>Novo produto</b>, escolha a aba <b>Com variações</b>.</li>
      <li>Informe os <b>tipos</b> (ex.: Tradicional, Baby look), as <b>cores</b> e os <b>tamanhos</b>, separados por vírgula. Os botões de tamanho preenchem rapidamente.</li>
      <li>Toque em <b>Montar grade</b>: cada combinação vira um item com código de barras próprio.</li>
      <li>Informe o estoque inicial de cada variação e salve.</li>
    </ol>
    <p class="dica">Para acrescentar uma cor ou tamanho depois, abra uma variação existente e toque em <b>Nova variação</b>.</p>
    <h4>Editar, inativar ou excluir</h4>
    <ul>
      <li>Toque no produto para editar. Alterar o campo <b>Estoque atual</b> registra um ajuste no histórico.</li>
      <li><b>Inativar</b> esconde o produto sem apagar o histórico (recomendado para itens que saíram de linha).</li>
      <li><b>Excluir</b> apaga o cadastro definitivamente; as vendas antigas continuam nos relatórios.</li>
    </ul>
    <h4>Cadastro em massa por planilha</h4>
    <ol>
      <li>Toque em <b>Exportar</b> para baixar a planilha modelo (já com os produtos atuais).</li>
      <li>Preencha no Excel ou Google Planilhas: nome, categoria, tipo, cor, tamanho, código, custo, preço, estoque, estoque mínimo, consignante e descrição.</li>
      <li>Toque em <b>Importar planilha</b>, escolha o arquivo, confira a prévia e toque em <b>Importar</b>.</li>
    </ol>
    <p class="dica">Códigos já cadastrados atualizam o cadastro (sem mexer no estoque). Linhas sem código recebem um código gerado automaticamente.</p>
    </div>`
  },
  {
    id: 'estoque', t: 'Entrada e saída de mercadoria', i: 'setas', html: `
    <h4>Entrada (chegada de mercadoria)</h4>
    <ol>
      <li>Abra <b>Entrada e saída</b> → aba <b>Entrada</b>.</li>
      <li>Leia os códigos com a <b>Câmera</b> ou leitor. Cada leitura soma 1 unidade; ajuste a quantidade se precisar.</li>
      <li>Escolha o <b>motivo</b> (compra, consignação recebida, produção própria…) e informe a nota ou fornecedor, se houver.</li>
      <li>Toque em <b>Confirmar entrada</b>. O sistema oferece imprimir as etiquetas dos itens recebidos.</li>
    </ol>
    <p class="dica">Leu um código que não está cadastrado? Um sócio pode cadastrar o produto na hora.</p>
    <h4>Saída / baixa (sem venda)</h4>
    <p>Use a aba <b>Saída / baixa</b> para perdas, quebras, brindes, uso interno ou devolução ao consignante/fornecedor. O procedimento é o mesmo da entrada.</p>
    <p class="dica"><b>Vendas não precisam de baixa manual</b>: o PDV já desconta o estoque.</p>
    <h4>Inventário (contagem do estoque)</h4>
    <ol>
      <li>Abra a aba <b>Inventário</b>. Se quiser contar só uma parte, escolha a <b>categoria</b> (escopo).</li>
      <li>Leia <b>cada unidade</b> da prateleira (cada leitura soma 1). Também dá para digitar a quantidade contada.</li>
      <li>Marque <b>"não contados = 0"</b> somente se tiver contado todo o escopo (os itens não lidos serão zerados).</li>
      <li>Confira a coluna <b>Diferença</b> e toque em <b>Aplicar ajustes</b>.</li>
    </ol>
    <p class="dica">A contagem fica salva no aparelho até ser aplicada, então pode ser feita em etapas.</p>`
  },
  {
    id: 'etiquetas', t: 'Etiquetas com código de barras', i: 'etiqueta', html: `
    <ol>
      <li>Abra <b>Etiquetas</b> e adicione os produtos: pela busca, pela câmera, ou em lote (<b>Qtd. = estoque</b> ou <b>1 de cada</b>, por categoria).</li>
      <li>Ajuste a quantidade de etiquetas de cada item.</li>
      <li>Em <b>Formato da etiqueta</b>, informe largura e altura em milímetros (ex.: 50 × 30), as colunas do rolo e o que deve aparecer (loja, nome, preço).</li>
      <li>Confira a <b>pré-visualização</b> e toque em <b>Imprimir</b>.</li>
    </ol>
    <h4>Na janela de impressão</h4>
    <ul>
      <li>Escolha a <b>impressora térmica</b>.</li>
      <li>Margens: <b>Nenhuma</b>. Escala: <b>100%</b> (desmarque "ajustar à página").</li>
      <li>No driver da impressora, o tamanho do papel deve ser igual ao da etiqueta.</li>
    </ul>
    <p class="dica">Sócios podem tocar em <b>Salvar como padrão</b> para que todos usem o mesmo formato. Produto sem código? Toque em <b>Gerar código</b> na lista.</p>`
  },
  {
    id: 'painel', t: 'Painel de vendas', i: 'painel', socio: true, html: `
    <ul>
      <li>Escolha o período no topo: hoje, ontem, 7 dias, 30 dias, este mês ou este ano.</li>
      <li><b>Faturamento</b>: total vendido (já com descontos). <b>Lucro bruto</b>: faturamento menos o custo dos produtos vendidos. <b>Margem</b>: lucro ÷ faturamento.</li>
      <li><b>Ticket médio</b>: valor médio por venda. <b>Estoque (a custo)</b>: quanto vale a mercadoria parada na loja.</li>
      <li>Os gráficos mostram faturamento ao longo do tempo, formas de pagamento, categorias e os horários de maior movimento (útil para escala de vendedores).</li>
      <li><b>Estoque baixo</b> lista o que precisa ser reposto; <b>Consignação</b> mostra quanto foi vendido de cada artesão no período.</li>
    </ul>
    <p class="dica">O lucro usa o custo cadastrado atualmente no produto. Mantenha os custos atualizados.</p>`
  },
  {
    id: 'consignacao', t: 'Consignação (artesãos e parceiros)', i: 'maos', socio: true, html: `
    <h4>Cadastrar um consignante</h4>
    <p>Em <b>Consignação → Consignantes → Novo consignante</b>, informe nome, telefone/WhatsApp, chave Pix e o acordo combinado.</p>
    <h4>Cadastrar produtos consignados</h4>
    <ul>
      <li>No cadastro do produto, marque <b>Consignado</b> e escolha o consignante.</li>
      <li>O campo <b>preço de custo</b> passa a ser o <b>valor de repasse</b>: quanto o artesão recebe por unidade vendida.</li>
      <li>Ao receber as peças, dê entrada com o motivo <b>Consignação recebida</b>.</li>
    </ul>
    <h4>Fazer o acerto de contas</h4>
    <ol>
      <li>Abra a aba <b>Acerto de contas</b>, escolha o consignante e o período (o sistema sugere a data seguinte ao último acerto).</li>
      <li>Toque em <b>Calcular</b>: aparecem os itens vendidos, o total a repassar e o que ainda está na loja.</li>
      <li>Envie o extrato por <b>PDF</b>, <b>Excel</b> ou <b>WhatsApp</b> para o consignante.</li>
      <li>Após pagar, toque em <b>Registrar pagamento</b>. Fica gravado no <b>Histórico de acertos</b>.</li>
    </ol>
    <p class="dica">Para devolver peças ao artesão, use <b>Entrada e saída → Saída</b> com o motivo "Devolução ao consignante".</p>`
  },
  {
    id: 'relatorios', t: 'Relatórios', i: 'relatorio', socio: true, html: `
    <ol>
      <li>Escolha o relatório e o período e toque em <b>Gerar</b>.</li>
      <li>Use <b>PDF</b>, <b>Excel</b> ou <b>Imprimir</b> para salvar ou compartilhar.</li>
    </ol>
    <table><tbody>
      <tr><th>Vendas no período</th><td>Lista de todas as vendas (toque para ver detalhes).</td></tr>
      <tr><th>Curva ABC</th><td>Produtos ordenados pelo faturamento. <b>A</b> = os que fazem 80% das vendas (nunca deixe faltar); <b>C</b> = pouca saída.</td></tr>
      <tr><th>Por categoria / vendedor</th><td>Faturamento, lucro e margem agrupados.</td></tr>
      <tr><th>Fechamento de caixa</th><td>Total de cada dia por forma de pagamento, para conferir com a maquininha e o dinheiro em caixa.</td></tr>
      <tr><th>Posição de estoque</th><td>Quantidade e valor da mercadoria a custo e a preço de venda.</td></tr>
      <tr><th>Reposição</th><td>Itens abaixo do mínimo, com sugestão de compra e custo previsto.</td></tr>
      <tr><th>Produtos parados</th><td>Itens com estoque que não venderam no período (candidatos a promoção).</td></tr>
      <tr><th>Movimentações</th><td>Todas as entradas, saídas, vendas e ajustes, com usuário e motivo.</td></tr>
      <tr><th>Consignação</th><td>Quanto foi vendido e quanto repassar a cada consignante.</td></tr>
      <tr><th>Cancelamentos</th><td>Vendas canceladas, por quem e por quê.</td></tr>
    </tbody></table>`
  },
  {
    id: 'usuarios', t: 'Usuários e permissões', i: 'usuarios', socio: true, html: `
    <ol>
      <li>A nova pessoa abre o app no aparelho dela, toca em <b>Criar conta</b> e informa o nome.</li>
      <li>Em <b>Usuários</b>, ela aparece como <span class="tag alerta">Aguardando aprovação</span>.</li>
      <li>Toque nela, escolha o perfil <b>Vendedor</b> ou <b>Sócio</b> e salve.</li>
    </ol>
    <ul>
      <li>Quando alguém sair da equipe, desmarque <b>Acesso ativo</b> (o histórico de vendas é mantido).</li>
      <li>Você não pode alterar o próprio perfil, para a loja nunca ficar sem sócio.</li>
    </ul>`
  },
  {
    id: 'atividades', t: 'Log de atividades', i: 'lista', socio: true, html: `
    <p>Mostra <b>quem fez o quê e quando</b> no sistema: acessos, vendas, cancelamentos, descontos, cadastros e alterações de produtos (com preço e custo antes e depois),
    entradas e saídas, inventários, etiquetas, consignação, usuários, configurações e relatórios exportados.</p>
    <ol>
      <li>Escolha o <b>período</b> e, se quiser, filtre por <b>usuário</b>, <b>tipo</b> de ação ou palavra (ex.: nome do produto ou número da venda).</li>
      <li>Marque <b>Somente ações que merecem atenção</b> para ver cancelamentos, vendas com desconto, perdas e quebras, ajustes de estoque, mudanças de preço/custo e alterações de usuários.</li>
      <li>Toque em uma linha para ver os detalhes (itens, valores, aparelho usado e se foi feito sem internet).</li>
      <li>No <b>Resumo por usuário</b>, toque em uma pessoa para ver só as ações dela.</li>
      <li>Exporte em <b>PDF</b> ou <b>Excel</b> para guardar.</li>
    </ol>
    <p class="dica">Os registros não podem ser alterados nem apagados por ninguém, nem pelos sócios. Ações feitas sem internet aparecem quando o aparelho volta a ficar online.</p>`
  },
  {
    id: 'configuracoes', t: 'Configurações e backup', i: 'config', socio: true, html: `
    <ul>
      <li><b>Dados da loja:</b> nome, endereço, telefone e Instagram aparecem no comprovante.</li>
      <li><b>Desconto máximo do vendedor:</b> limite em % para vendedores no PDV.</li>
      <li><b>Categorias e tamanhos:</b> listas sugeridas no cadastro de produtos.</li>
      <li><b>Backup:</b> toque em <b>Exportar backup</b> uma vez por semana e guarde o arquivo no Google Drive da loja. <b>Importar backup</b> restaura os dados.</li>
    </ul>`
  },
  {
    id: 'problemas', t: 'Dúvidas e problemas comuns', i: 'alerta', html: `
    <h4>A câmera não abre</h4>
    <ul>
      <li>Permita o acesso à câmera quando o navegador perguntar. Se negou antes: toque no cadeado ao lado do endereço → Permissões → Câmera → Permitir.</li>
      <li>Feche outros apps que estejam usando a câmera.</li>
      <li>Alternativa: digite o código no campo abaixo da imagem.</li>
    </ul>
    <h4>A leitura não funciona</h4>
    <ul>
      <li>Afaste ou aproxime o celular até o código ficar nítido e ocupar a faixa central; evite reflexos.</li>
      <li>Códigos muito pequenos ou amassados podem precisar ser digitados.</li>
    </ul>
    <h4>"Código não cadastrado"</h4>
    <p>O produto ainda não existe no sistema ou foi cadastrado com outro código. Peça a um sócio para cadastrar (ou corrigir o código).</p>
    <h4>O estoque do sistema está diferente da prateleira</h4>
    <p>Faça um <b>inventário</b> da categoria (Entrada e saída → Inventário) e aplique os ajustes. Perdas e brindes devem ser lançados como <b>Saída</b>.</p>
    <h4>Não estou vendo uma venda feita em outro aparelho</h4>
    <p>Verifique se o outro aparelho está <b>Online</b> (selo no topo). Vendas feitas offline aparecem para os demais depois que a internet volta.</p>
    <h4>O app parece desatualizado</h4>
    <p>Feche e abra o app novamente. No notebook, aperte <b>Ctrl + Shift + R</b>.</p>
    <h4>Esqueci a senha</h4>
    <p>Na tela de entrada, digite seu e-mail e toque em <b>Esqueci a senha</b>. Você receberá um link por e-mail (confira o spam).</p>`
  }
];

export function render(main, args = []) {
  const socio = isSocio();
  const secoes = SECOES.filter((s) => !s.socio || socio);
  const abrir = args[0] && secoes.find((s) => s.id === args[0]) ? args[0] : '';

  main.innerHTML = `
    <div class="card ajuda-topo">
      <img src="assets/logo.jpg" alt="" width="64" height="64">
      <div><h2 style="margin:0">Como usar o ${esc(state.config.nome)}</h2>
        <p class="muted small" style="margin:4px 0 0">Guia rápido das telas${socio ? '' : ' disponíveis para o seu perfil'}. Toque em um assunto para abrir.</p></div>
    </div>
    <div class="card">
      <label class="campo"><span>Buscar na ajuda</span><input id="aBusca" placeholder="Ex.: desconto, etiqueta, inventário, câmera"></label>
      <div class="acoes" style="margin-top:10px" id="aAtalhos">
        ${secoes.map((s) => `<button class="btn peq" data-ir="${s.id}">${esc(s.t)}</button>`).join('')}
      </div>
    </div>
    <div id="aLista">
      ${secoes.map((s) => `<details class="card ajuda-secao" id="ajuda-${s.id}" ${s.id === abrir ? 'open' : ''}>
        <summary>${ic(s.i)}<span>${esc(s.t)}</span>${s.socio ? '<span class="tag roxo">sócios</span>' : ''}</summary>
        <div class="ajuda-corpo">${s.html}</div></details>`).join('')}
      <div class="vazio hidden" id="aVazio">Nada encontrado. Tente outra palavra.</div>
    </div>`;

  // Partes exclusivas de sócios dentro de seções comuns
  if (!socio) $$('[data-socio]', main).forEach((el) => el.remove());

  const irPara = (id) => {
    const el = $(`#ajuda-${id}`, main);
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#aAtalhos', main).onclick = (e) => { const b = e.target.closest('[data-ir]'); if (b) irPara(b.dataset.ir); };
  $('#aBusca', main).oninput = debounce((e) => {
    const t = e.target.value.trim();
    let n = 0;
    for (const d of $$('.ajuda-secao', main)) {
      const ok = !t || casaBusca(d.textContent, t);
      d.classList.toggle('hidden', !ok);
      if (ok) n++;
      d.open = !!t && ok;
    }
    $('#aVazio', main).classList.toggle('hidden', n > 0);
  }, 200);
  if (abrir) setTimeout(() => irPara(abrir), 50);
}
