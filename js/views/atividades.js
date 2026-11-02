// Log de atividades: auditoria do que cada usuário fez no sistema (somente sócios).
import { state, store, LOG_ACOES, PAPEIS } from '../state.js';
import { $, esc, fmtDataHora, fmtData, diaISO, modal, casaBusca, debounce } from '../util.js';
import { periodo } from '../calc.js';
import { exportarPDF, exportarXLSX } from '../exportar.js';
import { ic } from '../icones.js';

const CATEGORIAS = ['Acesso', 'Vendas', 'Estoque', 'Produtos', 'Etiquetas', 'Consignação', 'Usuários', 'Sistema'];
const COR_CAT = { Acesso: '', Vendas: 'ok', Estoque: 'teal', Produtos: 'roxo', Etiquetas: '', Consignação: 'roxo', Usuários: 'alerta', Sistema: '' };
const LIMITE = 300;

/** Ações que merecem atenção dos sócios. */
function sensivel(l) {
  if (['venda_cancelada', 'produto_excluido', 'inventario', 'usuario', 'usuario_removido', 'backup_importado'].includes(l.acao)) return true;
  if (l.acao === 'produto_editado' && /(Preço|Custo|Estoque):/.test(l.descricao)) return true;
  if (l.acao === 'saida' && /perda|quebra|brinde|uso interno/i.test(l.descricao)) return true;
  if (l.acao === 'venda' && (l.detalhes?.desconto || 0) > 0) return true;
  return false;
}

export function render(main) {
  let per = '7d';
  let logs = [];
  let unsub = null;
  let mostrar = LIMITE;
  const filtro = { usuario: '', categoria: '', busca: '', atencao: false };

  main.innerHTML = `
    <div class="card">
      <p class="muted small" style="margin-top:0">Registro do que cada pessoa fez no sistema: acessos, vendas, cancelamentos, alterações de produtos e preços, entradas e saídas, inventários, etiquetas, consignação e usuários.
        Os registros não podem ser alterados nem apagados.</p>
      <div class="barra">
        <label class="campo"><span>Período</span><select id="lPer">
          <option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="7d" selected>Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option><option value="mes">Este mês</option><option value="mesant">Mês anterior</option><option value="custom">Personalizado</option></select></label>
        <label class="campo hidden" data-custom><span>De</span><input type="date" id="lDe" value="${diaISO()}"></label>
        <label class="campo hidden" data-custom><span>Até</span><input type="date" id="lAte" value="${diaISO()}"></label>
        <label class="campo"><span>Usuário</span><select id="lUsu"><option value="">Todos</option></select></label>
        <label class="campo"><span>Tipo</span><select id="lCat"><option value="">Todos</option>${CATEGORIAS.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label class="campo cresce"><span>Buscar</span><input id="lBusca" placeholder="Produto, nº da venda, motivo…"></label>
      </div>
      <div class="acoes">
        <label class="check"><input type="checkbox" id="lAtencao"> Somente ações que merecem atenção</label>
        <span class="espaco"></span>
        <button class="btn peq" id="lPdf">${ic('baixar')} PDF</button>
        <button class="btn peq" id="lXlsx">${ic('baixar')} Excel</button>
      </div>
    </div>
    <div class="kpis" id="lKpis"></div>
    <div class="card"><h3>Resumo por usuário</h3><div id="lUsuarios"></div></div>
    <div class="card" style="padding:0"><div id="lLista"><div class="vazio">Carregando…</div></div></div>`;

  const assinar = () => {
    unsub && unsub();
    const { de, ate } = periodo(per, $('#lDe', main).value, $('#lAte', main).value);
    unsub = store.subscribe('logs', { where: [['criadoEm', '>=', de.getTime()], ['criadoEm', '<=', ate.getTime()]] }, (arr) => {
      logs = arr.sort((a, b) => b.criadoEm - a.criadoEm);
      preencherUsuarios();
      desenhar();
    });
  };

  const preencherUsuarios = () => {
    const nomes = new Map(state.usuarios.map((u) => [u.id, u.nome || u.email]));
    for (const l of logs) if (!nomes.has(l.usuarioUid)) nomes.set(l.usuarioUid, l.usuarioNome);
    const sel = $('#lUsu', main);
    sel.innerHTML = `<option value="">Todos</option>${[...nomes].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([id, n]) => `<option value="${esc(id)}" ${id === filtro.usuario ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;
  };

  const filtrados = () => logs.filter((l) => (!filtro.usuario || l.usuarioUid === filtro.usuario)
    && (!filtro.categoria || l.categoria === filtro.categoria)
    && (!filtro.atencao || sensivel(l))
    && (!filtro.busca || casaBusca(`${l.descricao} ${l.usuarioNome} ${(LOG_ACOES[l.acao] || [])[1] || ''} ${JSON.stringify(l.detalhes || {})}`, filtro.busca)));

  function desenhar() {
    const ls = filtrados();
    const usuarios = new Set(ls.map((l) => l.usuarioUid));
    const qtd = (a) => ls.filter((l) => l.acao === a).length;
    const atencao = ls.filter(sensivel).length;
    $('#lKpis', main).innerHTML = `
      <div class="kpi"><div class="t">Ações registradas</div><div class="v">${ls.length}</div><div class="d">${usuarios.size} usuário(s)</div></div>
      <div class="kpi"><div class="t">Vendas</div><div class="v">${qtd('venda')}</div><div class="d">${qtd('venda_cancelada')} cancelamento(s)</div></div>
      <div class="kpi roxo"><div class="t">Alterações de produtos</div><div class="v">${qtd('produto_editado') + qtd('produto_criado') + qtd('produto_excluido')}</div><div class="d">cadastros, edições e exclusões</div></div>
      <div class="kpi ${atencao ? 'alerta' : ''}"><div class="t">Merecem atenção</div><div class="v">${atencao}</div><div class="d">cancelamentos, descontos, perdas, ajustes…</div></div>`;

    // Resumo por usuário
    const porUsu = new Map();
    for (const l of ls) {
      const r = porUsu.get(l.usuarioUid) || { nome: l.usuarioNome, papel: l.papel, total: 0, vendas: 0, atencao: 0, ultimo: 0, dispositivo: '' };
      r.total++; if (l.acao === 'venda') r.vendas++; if (sensivel(l)) r.atencao++;
      if (l.criadoEm > r.ultimo) { r.ultimo = l.criadoEm; r.dispositivo = l.dispositivo; }
      porUsu.set(l.usuarioUid, r);
    }
    $('#lUsuarios', main).innerHTML = porUsu.size ? `<div class="tabela-wrap"><table><thead><tr><th>Usuário</th><th class="num">Ações</th><th class="num">Vendas</th><th class="num">Atenção</th><th>Última atividade</th><th class="opc">Aparelho</th></tr></thead><tbody>
      ${[...porUsu].sort((a, b) => b[1].ultimo - a[1].ultimo).map(([uid, r]) => `<tr class="clicavel" data-uid="${esc(uid)}"><td><b>${esc(r.nome)}</b><br><span class="small muted">${esc(PAPEIS[r.papel] || r.papel || '')}</span></td>
        <td class="num">${r.total}</td><td class="num">${r.vendas}</td><td class="num">${r.atencao ? `<span class="tag alerta">${r.atencao}</span>` : '0'}</td>
        <td>${esc(fmtDataHora(r.ultimo))}</td><td class="opc small">${esc(r.dispositivo || '')}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma atividade no período.</div>';

    $('#lLista', main).innerHTML = ls.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Descrição</th></tr></thead><tbody>
      ${ls.slice(0, mostrar).map((l, i) => `<tr class="clicavel" data-i="${i}">
        <td class="nowrap small">${esc(fmtDataHora(l.criadoEm))}</td>
        <td><b>${esc(l.usuarioNome)}</b></td>
        <td><span class="tag ${COR_CAT[l.categoria] || ''}">${esc((LOG_ACOES[l.acao] || [l.categoria, l.acao])[1])}</span>${sensivel(l) ? ' <span class="tag alerta" title="Merece atenção">!</span>' : ''}</td>
        <td>${esc(l.descricao)}</td></tr>`).join('')}
      </tbody></table></div>
      ${ls.length > mostrar ? `<div class="center" style="padding:12px"><button class="btn" id="lMais">Mostrar mais (${ls.length - mostrar})</button></div>` : ''}`
      : `<div class="vazio">Nenhuma atividade encontrada com esses filtros.${logs.length ? '' : '<br><span class="small">Os registros começam a partir da atualização que criou esta tela.</span>'}</div>`;
    const bm = $('#lMais', main);
    if (bm) bm.onclick = () => { mostrar += LIMITE; desenhar(); };
  }

  const relatorio = () => {
    const ls = filtrados();
    const { de, ate } = periodo(per, $('#lDe', main).value, $('#lAte', main).value);
    return {
      titulo: 'Log de atividades',
      subtitulo: `Período: ${fmtData(de.getTime())} a ${fmtData(ate.getTime())}${filtro.usuario ? ` · Usuário: ${$('#lUsu', main).selectedOptions[0]?.textContent}` : ''}${filtro.categoria ? ` · Tipo: ${filtro.categoria}` : ''}`,
      resumo: [{ t: 'Ações', v: String(ls.length) }, { t: 'Merecem atenção', v: String(ls.filter(sensivel).length) }],
      colunas: [{ k: 'criadoEm', t: 'Data/hora', tipo: 'dh' }, { k: 'usuarioNome', t: 'Usuário' }, { k: 'acaoNome', t: 'Ação' }, { k: 'descricao', t: 'Descrição' }, { k: 'dispositivo', t: 'Aparelho' }],
      linhas: ls.map((l) => ({ ...l, acaoNome: (LOG_ACOES[l.acao] || [l.categoria, l.acao])[1] + (sensivel(l) ? ' (!)' : '') }))
    };
  };

  $('#lPer', main).onchange = (e) => {
    per = e.target.value;
    main.querySelectorAll('[data-custom]').forEach((x) => x.classList.toggle('hidden', per !== 'custom'));
    mostrar = LIMITE; assinar();
  };
  $('#lDe', main).onchange = () => per === 'custom' && assinar();
  $('#lAte', main).onchange = () => per === 'custom' && assinar();
  $('#lUsu', main).onchange = (e) => { filtro.usuario = e.target.value; mostrar = LIMITE; desenhar(); };
  $('#lCat', main).onchange = (e) => { filtro.categoria = e.target.value; mostrar = LIMITE; desenhar(); };
  $('#lAtencao', main).onchange = (e) => { filtro.atencao = e.target.checked; mostrar = LIMITE; desenhar(); };
  $('#lBusca', main).oninput = debounce((e) => { filtro.busca = e.target.value.trim(); mostrar = LIMITE; desenhar(); }, 200);
  $('#lPdf', main).onclick = () => exportarPDF(relatorio());
  $('#lXlsx', main).onclick = () => exportarXLSX(relatorio());
  $('#lUsuarios', main).onclick = (e) => {
    const tr = e.target.closest('[data-uid]');
    if (!tr) return;
    filtro.usuario = tr.dataset.uid; $('#lUsu', main).value = tr.dataset.uid; mostrar = LIMITE; desenhar();
    $('#lLista', main).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#lLista', main).onclick = (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) detalhe(filtrados()[Number(tr.dataset.i)]);
  };

  assinar();
  return () => unsub && unsub();
}

function detalhe(l) {
  if (!l) return;
  const d = l.detalhes || {};
  const ROT = { itens: 'Itens', alteracoes: 'Alterações', ajustes: 'Ajustes', variacoes: 'Variações', motivo: 'Motivo', documento: 'Documento', obs: 'Observação',
    numero: 'Venda', total: 'Total', desconto: 'Desconto', pagamento: 'Pagamento', codigo: 'Código', valor: 'Valor', calculado: 'Valor calculado', forma: 'Forma',
    preco: 'Preço', custo: 'Custo', nome: 'Nome', novos: 'Novos', atualizados: 'Atualizados', arquivo: 'Arquivo' };
  const linhas = Object.entries(d).filter(([k, v]) => ROT[k] && v !== '' && v !== null && v !== undefined).map(([k, v]) =>
    `<tr><th>${esc(ROT[k])}</th><td>${Array.isArray(v) ? `<ul style="margin:0;padding-left:18px">${v.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('');
  modal({
    titulo: (LOG_ACOES[l.acao] || [l.categoria, l.acao])[1],
    largo: true,
    html: `<p style="margin-top:0">${esc(l.descricao)}</p>
      <div class="tabela-wrap"><table><tbody>
        <tr><th>Data/hora</th><td>${esc(fmtDataHora(l.criadoEm))}</td></tr>
        <tr><th>Usuário</th><td>${esc(l.usuarioNome)} – ${esc(l.usuarioEmail || '')} (${esc(PAPEIS[l.papel] || l.papel || '')})</td></tr>
        <tr><th>Aparelho</th><td>${esc(l.dispositivo || '')}${l.online === false ? ' · <span class="tag alerta">feito sem internet</span>' : ''}</td></tr>
        ${linhas}
      </tbody></table></div>`,
    botoes: [{ t: 'Fechar', cls: 'prim' }]
  });
}
