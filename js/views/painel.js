// Painel (dashboard) de vendas para os sócios.
import { state, on, nomeProduto, estoqueBaixo, PAGAMENTOS, consignanteNome } from '../state.js';
import { $, $$, esc, brl, pct, fmtDiaCurto, n2 } from '../util.js';
import { periodo, assinarVendas, resumo, itensVendidos, agrupar, diasEntre, valorEstoque } from '../calc.js';
import { ic } from '../icones.js';

const CORES = ['#1fc9a6', '#5b3fa0', '#e0a526', '#3a7bd5', '#e86a5c', '#0b1026', '#7fd8c4', '#a48fd6', '#94a3b8', '#f2c46d'];
const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['ano', 'Este ano']];

export function render(main) {
  let per = sessionStorage.getItem('ee_painel_per') || '7d';
  let vendas = [];
  let unsub = null;
  const graficos = [];

  main.innerHTML = `
    <div class="abas" id="pPer">${PERIODOS.map(([k, t]) => `<button data-p="${k}">${t}</button>`).join('')}</div>
    <div class="kpis" id="pKpis"></div>
    <div class="grid g2">
      <div class="card"><h3 id="tEvol">Faturamento</h3><div class="grafico"><canvas id="gEvol"></canvas></div></div>
      <div class="card"><h3>Formas de pagamento</h3><div class="grafico"><canvas id="gPag"></canvas></div></div>
      <div class="card"><h3>Vendas por categoria</h3><div class="grafico"><canvas id="gCat"></canvas></div></div>
      <div class="card"><h3>Movimento por horário</h3><div class="grafico"><canvas id="gHora"></canvas></div></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>Mais vendidos</h3><div id="pTop"></div></div>
      <div class="card"><div class="acoes" style="margin-bottom:8px"><h3 style="margin:0">Estoque baixo</h3><span class="espaco"></span><a class="btn peq" href="#/produtos">Ver produtos</a></div><div id="pBaixo"></div></div>
    </div>
    <div class="card"><h3>Consignação no período</h3><div id="pCons"></div></div>`;

  const assinar = () => {
    unsub && unsub();
    const { de, ate } = periodo(per);
    unsub = assinarVendas(de, ate, (arr) => { vendas = arr; desenhar(); });
  };

  const grafico = (id, config) => {
    const el = $(`#${id}`, main);
    const g = window.Chart ? new window.Chart(el, config) : null;
    if (g) graficos.push(g);
  };

  function desenhar() {
    graficos.splice(0).forEach((g) => g.destroy());
    $$('#pPer button', main).forEach((b) => b.classList.toggle('ativo', b.dataset.p === per));
    const r = resumo(vendas);
    const itens = itensVendidos(vendas);
    const est = valorEstoque();
    const baixos = state.produtos.filter(estoqueBaixo);

    $('#pKpis', main).innerHTML = `
      <div class="kpi"><div class="t">Faturamento</div><div class="v">${esc(brl(r.faturamento))}</div><div class="d">${r.vendas} venda(s)${r.descontos ? ` · ${esc(brl(r.descontos))} em descontos` : ''}</div></div>
      <div class="kpi roxo"><div class="t">Lucro bruto</div><div class="v">${esc(brl(r.lucro))}</div><div class="d">Margem ${esc(pct(r.margem))}</div></div>
      <div class="kpi"><div class="t">Ticket médio</div><div class="v">${esc(brl(r.ticket))}</div><div class="d">${r.itens} item(ns) vendidos</div></div>
      <div class="kpi roxo"><div class="t">Estoque (a custo)</div><div class="v">${esc(brl(est.custo))}</div><div class="d">${n2(est.unidades)} un. · ${esc(brl(est.venda))} a preço de venda</div></div>
      <a class="kpi ${baixos.length ? 'alerta' : ''}" href="#/produtos" style="text-decoration:none;color:inherit"><div class="t">Estoque baixo</div><div class="v">${baixos.length}</div><div class="d">produto(s) para repor</div></a>`;

    // Evolução: por hora (1 dia) ou por dia
    const { de, ate } = periodo(per);
    const umDia = ['hoje', 'ontem'].includes(per);
    let rot, fat, luc;
    if (umDia) {
      rot = Array.from({ length: 24 }, (_, h) => `${h}h`);
      fat = Array(24).fill(0); luc = Array(24).fill(0);
      for (const i of itens) { const h = new Date(i.criadoEm).getHours(); fat[h] += i.receita; luc[h] += i.lucro; }
      const usados = fat.map((v, h) => [v, h]).filter(([v]) => v > 0).map(([, h]) => h);
      const ini = Math.min(8, ...usados), fim = Math.max(18, ...usados);
      rot = rot.slice(ini, fim + 1); fat = fat.slice(ini, fim + 1); luc = luc.slice(ini, fim + 1);
    } else if (per === 'ano') {
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      const m = ate.getMonth() + 1;
      rot = meses.slice(0, m); fat = Array(m).fill(0); luc = Array(m).fill(0);
      for (const i of itens) { const k = new Date(i.criadoEm).getMonth(); fat[k] += i.receita; luc[k] += i.lucro; }
    } else {
      const dias = diasEntre(de, ate);
      const g = new Map(agrupar(itens, (i) => i.dia, ['receita', 'lucro']).map((x) => [x.chave, x]));
      rot = dias.map(fmtDiaCurto); fat = dias.map((d) => g.get(d)?.receita || 0); luc = dias.map((d) => g.get(d)?.lucro || 0);
    }
    $('#tEvol', main).textContent = umDia ? 'Faturamento por hora' : per === 'ano' ? 'Faturamento por mês' : 'Faturamento por dia';
    const moeda = { callbacks: { label: (c) => `${c.dataset.label}: ${brl(c.parsed.y ?? c.parsed)}` } };
    grafico('gEvol', {
      type: 'bar',
      data: { labels: rot, datasets: [
        { label: 'Faturamento', data: fat, backgroundColor: '#1fc9a6', borderRadius: 4, order: 2 },
        { label: 'Lucro', data: luc, type: 'line', borderColor: '#5b3fa0', backgroundColor: '#5b3fa0', tension: 0.3, pointRadius: 2, order: 1 }
      ] },
      options: { maintainAspectRatio: false, plugins: { tooltip: moeda }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => brl(v).replace(',00', '') } } } }
    });

    const pag = Object.entries(PAGAMENTOS).map(([k, t]) => [t, vendas.filter((v) => v.status !== 'cancelada' && v.pagamento === k).reduce((s, v) => s + v.total, 0)]);
    grafico('gPag', {
      type: 'doughnut',
      data: { labels: pag.map((x) => x[0]), datasets: [{ data: pag.map((x) => x[1]), backgroundColor: CORES }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => `${c.label}: ${brl(c.parsed)}` } } } }
    });

    const cats = agrupar(itens, (i) => i.categoria || 'Sem categoria').sort((a, b) => b.receita - a.receita).slice(0, 10);
    grafico('gCat', {
      type: 'bar',
      data: { labels: cats.map((c) => c.chave), datasets: [{ label: 'Faturamento', data: cats.map((c) => c.receita), backgroundColor: CORES }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => brl(c.parsed.x) } } } }
    });

    const horas = Array(24).fill(0);
    for (const v of vendas) if (v.status !== 'cancelada') horas[new Date(v.criadoEm).getHours()]++;
    const hUsadas = horas.map((v, h) => [v, h]).filter(([v]) => v).map(([, h]) => h);
    const hIni = Math.min(8, ...hUsadas), hFim = Math.max(18, ...hUsadas);
    grafico('gHora', {
      type: 'bar',
      data: { labels: horas.slice(hIni, hFim + 1).map((_, i) => `${hIni + i}h`), datasets: [{ label: 'Vendas', data: horas.slice(hIni, hFim + 1), backgroundColor: '#5b3fa0', borderRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const top = agrupar(itens, (i) => i.produtoId).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
    $('#pTop', main).innerHTML = top.length ? `<div class="tabela-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Faturamento</th><th class="num">Lucro</th></tr></thead><tbody>
      ${top.map((t) => `<tr><td>${esc(state.porId.has(t.chave) ? nomeProduto(state.porId.get(t.chave)) : itens.find((i) => i.produtoId === t.chave)?.nome)}</td><td class="num">${t.qtd}</td><td class="num">${esc(brl(t.receita))}</td><td class="num">${esc(brl(t.lucro))}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Sem vendas no período.</div>';

    $('#pBaixo', main).innerHTML = baixos.length ? baixos.slice(0, 12).map((p) => `<div class="lista-item"><div class="info"><b>${esc(nomeProduto(p))}</b><span class="small muted">mínimo ${Number(p.estoqueMin) || 0}</span></div>
      <span class="tag ${(Number(p.estoque) || 0) <= 0 ? 'perigo' : 'alerta'}">${Number(p.estoque) || 0} un.</span></div>`).join('')
      + (baixos.length > 12 ? `<p class="muted small">+ ${baixos.length - 12} outro(s)</p>` : '')
      : `<div class="vazio">${ic('caixa')}<br>Nenhum produto abaixo do mínimo.</div>`;

    const cons = agrupar(itens.filter((i) => i.consignanteId), (i) => i.consignanteId).sort((a, b) => b.receita - a.receita);
    $('#pCons', main).innerHTML = cons.length ? `<div class="tabela-wrap"><table><thead><tr><th>Consignante</th><th class="num">Qtd vendida</th><th class="num">Vendido</th><th class="num">A repassar</th><th class="num">Ganho da loja</th></tr></thead><tbody>
      ${cons.map((c) => `<tr><td>${esc(consignanteNome(c.chave) || '(removido)')}</td><td class="num">${c.qtd}</td><td class="num">${esc(brl(c.receita))}</td><td class="num">${esc(brl(c.custo))}</td><td class="num">${esc(brl(c.lucro))}</td></tr>`).join('')}
      </tbody></table></div><p class="small muted">Faça o acerto em <a href="#/consignacao">Consignação</a>.</p>` : '<div class="vazio">Nenhum produto consignado vendido no período.</div>';
  }

  $('#pPer', main).onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    per = b.dataset.p; sessionStorage.setItem('ee_painel_per', per);
    assinar();
  };
  assinar();
  const off = on(['produtos', 'custos', 'consignantes'], desenhar);
  return () => { unsub && unsub(); off(); graficos.forEach((g) => g.destroy()); };
}
