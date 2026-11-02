// Relatórios gerenciais com exportação para PDF e Excel.
import { state, nomeProduto, custoDe, consignanteNome, estoqueBaixo, PAGAMENTOS } from '../state.js';
import { $, esc, brl, pct, fmtData, diaISO, toast } from '../util.js';
import { periodo, buscarVendas, buscarMovimentos, resumo, itensVendidos, agrupar, vendasValidas } from '../calc.js';
import { exportarPDF, exportarXLSX, imprimirRelatorio, tabelaHTML } from '../exportar.js';
import { ic } from '../icones.js';
import { detalheVenda } from './vendas.js';

const REL = {
  vendas: { t: 'Vendas no período', periodo: true },
  produtos: { t: 'Vendas por produto (curva ABC)', periodo: true },
  categorias: { t: 'Vendas por categoria', periodo: true },
  vendedores: { t: 'Vendas por vendedor', periodo: true },
  caixa: { t: 'Fechamento de caixa (por dia e pagamento)', periodo: true },
  estoque: { t: 'Posição de estoque (inventário valorizado)', periodo: false },
  reposicao: { t: 'Reposição (estoque baixo)', periodo: false },
  parados: { t: 'Produtos parados (sem venda no período)', periodo: true },
  movimentos: { t: 'Movimentações de estoque', periodo: true },
  consignacao: { t: 'Consignação por consignante', periodo: true },
  cancelamentos: { t: 'Vendas canceladas', periodo: true }
};

export function render(main) {
  let rel = null;
  let vendasCache = [];
  main.innerHTML = `<div class="card"><div class="barra">
      <label class="campo cresce"><span>Relatório</span><select id="rTipo">${Object.entries(REL).map(([k, r]) => `<option value="${k}">${esc(r.t)}</option>`).join('')}</select></label>
      <label class="campo" data-per><span>Período</span><select id="rPer">
        <option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d" selected>Últimos 30 dias</option>
        <option value="mes">Este mês</option><option value="mesant">Mês anterior</option><option value="ano">Este ano</option><option value="custom">Personalizado</option></select></label>
      <label class="campo hidden" data-custom><span>De</span><input type="date" id="rDe" value="${diaISO()}"></label>
      <label class="campo hidden" data-custom><span>Até</span><input type="date" id="rAte" value="${diaISO()}"></label>
      <button class="btn prim" id="rGerar">Gerar</button>
    </div></div>
    <div id="rSaida"></div>`;

  const ajustar = () => {
    const usaPer = REL[$('#rTipo', main).value].periodo;
    main.querySelector('[data-per]').classList.toggle('hidden', !usaPer);
    main.querySelectorAll('[data-custom]').forEach((x) => x.classList.toggle('hidden', !usaPer || $('#rPer', main).value !== 'custom'));
  };
  $('#rTipo', main).onchange = ajustar;
  $('#rPer', main).onchange = ajustar;

  $('#rGerar', main).onclick = async () => {
    const tipo = $('#rTipo', main).value;
    const { de, ate } = periodo($('#rPer', main).value, $('#rDe', main).value, $('#rAte', main).value);
    const saida = $('#rSaida', main);
    saida.innerHTML = '<div class="card vazio">Gerando…</div>';
    try {
      const sub = REL[tipo].periodo ? `Período: ${fmtData(de.getTime())} a ${fmtData(ate.getTime())}` : `Posição em ${fmtData(Date.now())}`;
      if (['vendas', 'produtos', 'categorias', 'vendedores', 'caixa', 'parados', 'consignacao', 'cancelamentos'].includes(tipo)) vendasCache = await buscarVendas(de, ate);
      const movs = tipo === 'movimentos' ? await buscarMovimentos(de, ate) : [];
      rel = { titulo: REL[tipo].t, subtitulo: sub, ...gerar(tipo, vendasCache, movs) };
      saida.innerHTML = `${rel.resumo?.length ? `<div class="kpis">${rel.resumo.map((r) => `<div class="kpi"><div class="t">${esc(r.t)}</div><div class="v" style="font-size:1.2rem">${esc(r.v)}</div></div>`).join('')}</div>` : ''}
        <div class="card"><div class="acoes" style="margin-bottom:10px"><h3 style="margin:0">${esc(rel.titulo)}</h3><span class="muted small">${esc(sub)} · ${rel.linhas.length} linha(s)</span><span class="espaco"></span>
          <button class="btn peq" data-pdf>${ic('baixar')} PDF</button><button class="btn peq" data-xlsx>${ic('baixar')} Excel</button><button class="btn peq" data-imp>${ic('imprimir')} Imprimir</button></div>
          ${tabelaHTML(rel, { limite: 1000, onClickLinha: tipo === 'vendas' || tipo === 'cancelamentos' })}
          ${rel.linhas.length > 1000 ? '<p class="muted small">Exibindo 1000 linhas. Exporte para ver tudo.</p>' : ''}</div>`;
      saida.querySelector('[data-pdf]').onclick = () => exportarPDF(rel);
      saida.querySelector('[data-xlsx]').onclick = () => exportarXLSX(rel);
      saida.querySelector('[data-imp]').onclick = () => imprimirRelatorio(rel);
      if (tipo === 'vendas' || tipo === 'cancelamentos') {
        saida.querySelector('tbody')?.addEventListener('click', (e) => {
          const tr = e.target.closest('[data-i]');
          if (tr) detalheVenda(vendasCache.find((v) => v.id === rel.linhas[Number(tr.dataset.i)]._id));
        });
      }
    } catch (e) {
      console.error(e);
      saida.innerHTML = `<div class="card"><b>Não foi possível gerar o relatório.</b><p class="muted">${esc(e.message)}</p></div>`;
      toast(e.message, 'erro');
    }
  };
  ajustar();
}

function gerar(tipo, vendas, movs) {
  const r = resumo(vendas);
  const resumoVendas = [
    { t: 'Faturamento', v: brl(r.faturamento) }, { t: 'Lucro bruto', v: brl(r.lucro) }, { t: 'Margem', v: pct(r.margem) },
    { t: 'Vendas', v: String(r.vendas) }, { t: 'Ticket médio', v: brl(r.ticket) }, { t: 'Itens', v: String(r.itens) }
  ];
  const itens = itensVendidos(vendas);
  const colsValores = [{ k: 'qtd', t: 'Qtd', tipo: 'int' }, { k: 'receita', t: 'Faturamento', tipo: 'brl' }, { k: 'custo', t: 'Custo', tipo: 'brl' }, { k: 'lucro', t: 'Lucro', tipo: 'brl' }, { k: 'margem', t: 'Margem', tipo: 'pct' }];
  const soma = (ls, ks) => Object.fromEntries(ks.map((k) => [k, ls.reduce((s, l) => s + (Number(l[k]) || 0), 0)]));
  const comMargem = (g) => ({ ...g, margem: g.receita ? g.lucro / g.receita : 0 });
  const totaisValores = (ls) => { const t = soma(ls, ['qtd', 'receita', 'custo', 'lucro']); t.margem = t.receita ? t.lucro / t.receita : 0; return t; };

  switch (tipo) {
    case 'vendas': {
      const ls = vendasValidas(vendas).sort((a, b) => a.criadoEm - b.criadoEm).map((v) => ({
        _id: v.id, criadoEm: v.criadoEm, numero: v.numero, vendedor: v.vendedorNome, pagamento: PAGAMENTOS[v.pagamento] || v.pagamento,
        itens: v.qtdItens, subtotal: v.subtotal, desconto: v.desconto, total: v.total
      }));
      return {
        resumo: resumoVendas,
        colunas: [{ k: 'criadoEm', t: 'Data/hora', tipo: 'dh' }, { k: 'numero', t: 'Venda' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'pagamento', t: 'Pagamento' },
          { k: 'itens', t: 'Itens', tipo: 'int' }, { k: 'subtotal', t: 'Subtotal', tipo: 'brl' }, { k: 'desconto', t: 'Desconto', tipo: 'brl' }, { k: 'total', t: 'Total', tipo: 'brl' }],
        linhas: ls, totais: soma(ls, ['itens', 'subtotal', 'desconto', 'total'])
      };
    }
    case 'produtos': {
      const gs = agrupar(itens, (i) => i.produtoId).map(comMargem).sort((a, b) => b.receita - a.receita);
      const total = gs.reduce((s, g) => s + g.receita, 0) || 1;
      let acum = 0;
      const ls = gs.map((g) => {
        acum += g.receita;
        const p = state.porId.get(g.chave);
        const nome = p ? nomeProduto(p) : itens.find((i) => i.produtoId === g.chave)?.nome;
        return { ...g, produto: nome, categoria: p?.categoria || '', part: g.receita / total, acum: acum / total, abc: acum / total <= 0.8 ? 'A' : acum / total <= 0.95 ? 'B' : 'C' };
      });
      const cont = (c) => ls.filter((l) => l.abc === c).length;
      return {
        resumo: [...resumoVendas.slice(0, 3), { t: 'Classe A (80% do faturamento)', v: `${cont('A')} produto(s)` }, { t: 'Classe B', v: `${cont('B')} produto(s)` }, { t: 'Classe C', v: `${cont('C')} produto(s)` }],
        colunas: [{ k: 'produto', t: 'Produto' }, { k: 'categoria', t: 'Categoria' }, ...colsValores, { k: 'part', t: '% fat.', tipo: 'pct' }, { k: 'abc', t: 'ABC' }],
        linhas: ls, totais: totaisValores(ls)
      };
    }
    case 'categorias': {
      const ls = agrupar(itens, (i) => i.categoria || 'Sem categoria').map((g) => ({ ...comMargem(g), categoria: g.chave })).sort((a, b) => b.receita - a.receita);
      return { resumo: resumoVendas, colunas: [{ k: 'categoria', t: 'Categoria' }, ...colsValores], linhas: ls, totais: totaisValores(ls) };
    }
    case 'vendedores': {
      const vs = vendasValidas(vendas);
      const ls = agrupar(itens, (i) => i.vendedorNome || '—').map((g) => {
        const minhas = vs.filter((v) => (v.vendedorNome || '—') === g.chave);
        const fat = minhas.reduce((s, v) => s + v.total, 0);
        return { ...comMargem(g), vendedor: g.chave, vendas: minhas.length, ticket: minhas.length ? fat / minhas.length : 0, desconto: minhas.reduce((s, v) => s + (v.desconto || 0), 0) };
      }).sort((a, b) => b.receita - a.receita);
      return {
        resumo: resumoVendas,
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'vendas', t: 'Vendas', tipo: 'int' }, { k: 'qtd', t: 'Itens', tipo: 'int' }, { k: 'receita', t: 'Faturamento', tipo: 'brl' }, { k: 'ticket', t: 'Ticket médio', tipo: 'brl' }, { k: 'desconto', t: 'Descontos', tipo: 'brl' }, { k: 'lucro', t: 'Lucro', tipo: 'brl' }],
        linhas: ls, totais: soma(ls, ['vendas', 'qtd', 'receita', 'desconto', 'lucro'])
      };
    }
    case 'caixa': {
      const dias = [...new Set(vendas.map((v) => v.dia))].sort();
      const ls = dias.map((d) => {
        const vd = vendas.filter((v) => v.dia === d);
        const ok = vendasValidas(vd);
        const o = { dia: new Date(`${d}T12:00:00`).getTime(), vendas: ok.length, canceladas: vd.length - ok.length };
        for (const k of Object.keys(PAGAMENTOS)) o[k] = ok.filter((v) => v.pagamento === k).reduce((s, v) => s + v.total, 0);
        o.troco = ok.reduce((s, v) => s + (v.troco || 0), 0);
        o.total = ok.reduce((s, v) => s + v.total, 0);
        return o;
      });
      return {
        resumo: [{ t: 'Total', v: brl(r.faturamento) }, ...Object.entries(PAGAMENTOS).map(([k, t]) => ({ t, v: brl(ls.reduce((s, l) => s + l[k], 0)) }))],
        colunas: [{ k: 'dia', t: 'Dia', tipo: 'data' }, { k: 'vendas', t: 'Vendas', tipo: 'int' }, { k: 'canceladas', t: 'Canc.', tipo: 'int' },
          ...Object.entries(PAGAMENTOS).map(([k, t]) => ({ k, t, tipo: 'brl' })), { k: 'total', t: 'Total', tipo: 'brl' }],
        linhas: ls, totais: soma(ls, ['vendas', 'canceladas', ...Object.keys(PAGAMENTOS), 'total'])
      };
    }
    case 'estoque': {
      const ls = state.produtos.filter((p) => p.ativo !== false).map((p) => {
        const e = Number(p.estoque) || 0;
        const c = custoDe(p.id);
        return { produto: nomeProduto(p), codigo: p.codigo, categoria: p.categoria, origem: p.consignanteId ? `Consig.: ${consignanteNome(p.consignanteId)}` : 'Próprio', estoque: e, custo: c, preco: p.preco, totalCusto: Math.max(0, e) * c, totalVenda: Math.max(0, e) * (Number(p.preco) || 0) };
      });
      const t = soma(ls, ['estoque', 'totalCusto', 'totalVenda']);
      const proprio = ls.filter((l) => l.origem === 'Próprio');
      return {
        resumo: [{ t: 'Produtos ativos', v: String(ls.length) }, { t: 'Unidades', v: String(t.estoque) }, { t: 'Valor a custo', v: brl(t.totalCusto) }, { t: 'Valor a preço de venda', v: brl(t.totalVenda) },
          { t: 'Custo – só próprios', v: brl(proprio.reduce((s, l) => s + l.totalCusto, 0)) }],
        colunas: [{ k: 'produto', t: 'Produto' }, { k: 'codigo', t: 'Código' }, { k: 'categoria', t: 'Categoria' }, { k: 'origem', t: 'Origem' }, { k: 'estoque', t: 'Estoque', tipo: 'int' },
          { k: 'custo', t: 'Custo un.', tipo: 'brl' }, { k: 'preco', t: 'Preço un.', tipo: 'brl' }, { k: 'totalCusto', t: 'Total custo', tipo: 'brl' }, { k: 'totalVenda', t: 'Total venda', tipo: 'brl' }],
        linhas: ls, totais: t
      };
    }
    case 'reposicao': {
      const ls = state.produtos.filter(estoqueBaixo).map((p) => {
        const e = Number(p.estoque) || 0;
        const min = Number(p.estoqueMin) || 0;
        const sugestao = Math.max(1, min * 2 - e);
        return { produto: nomeProduto(p), codigo: p.codigo, categoria: p.categoria, fornecedor: p.consignanteId ? consignanteNome(p.consignanteId) : '', estoque: e, minimo: min, sugestao, custoPrev: sugestao * custoDe(p.id) };
      }).sort((a, b) => a.estoque - b.estoque);
      return {
        resumo: [{ t: 'Produtos para repor', v: String(ls.length) }, { t: 'Custo previsto da reposição', v: brl(ls.reduce((s, l) => s + l.custoPrev, 0)) }],
        colunas: [{ k: 'produto', t: 'Produto' }, { k: 'codigo', t: 'Código' }, { k: 'categoria', t: 'Categoria' }, { k: 'fornecedor', t: 'Consignante' }, { k: 'estoque', t: 'Estoque', tipo: 'int' },
          { k: 'minimo', t: 'Mínimo', tipo: 'int' }, { k: 'sugestao', t: 'Sugestão compra', tipo: 'int' }, { k: 'custoPrev', t: 'Custo previsto', tipo: 'brl' }],
        linhas: ls, totais: soma(ls, ['sugestao', 'custoPrev'])
      };
    }
    case 'parados': {
      const vendidos = new Set(itens.map((i) => i.produtoId));
      const ls = state.produtos.filter((p) => p.ativo !== false && (Number(p.estoque) || 0) > 0 && !vendidos.has(p.id)).map((p) => ({
        produto: nomeProduto(p), codigo: p.codigo, categoria: p.categoria, estoque: Number(p.estoque), cadastro: p.criadoEm, capital: Number(p.estoque) * custoDe(p.id)
      })).sort((a, b) => b.capital - a.capital);
      return {
        resumo: [{ t: 'Produtos sem venda', v: String(ls.length) }, { t: 'Capital parado (custo)', v: brl(ls.reduce((s, l) => s + l.capital, 0)) }],
        colunas: [{ k: 'produto', t: 'Produto' }, { k: 'codigo', t: 'Código' }, { k: 'categoria', t: 'Categoria' }, { k: 'cadastro', t: 'Cadastro', tipo: 'data' }, { k: 'estoque', t: 'Estoque', tipo: 'int' }, { k: 'capital', t: 'Capital parado', tipo: 'brl' }],
        linhas: ls, totais: soma(ls, ['estoque', 'capital'])
      };
    }
    case 'movimentos': {
      const ls = movs.sort((a, b) => a.criadoEm - b.criadoEm).map((m) => ({
        criadoEm: m.criadoEm, tipo: m.tipo, motivo: m.motivo, produto: m.produtoNome, codigo: m.codigo, qtd: m.qtd, documento: m.documento, usuario: m.usuarioNome, obs: m.obs
      }));
      const ent = ls.filter((l) => l.qtd > 0).reduce((s, l) => s + l.qtd, 0);
      const sai = ls.filter((l) => l.qtd < 0).reduce((s, l) => s + l.qtd, 0);
      return {
        resumo: [{ t: 'Movimentos', v: String(ls.length) }, { t: 'Unidades que entraram', v: String(ent) }, { t: 'Unidades que saíram', v: String(-sai) },
          { t: 'Perdas/quebras', v: String(-ls.filter((l) => /perda|quebra/i.test(l.motivo)).reduce((s, l) => s + l.qtd, 0)) }],
        colunas: [{ k: 'criadoEm', t: 'Data/hora', tipo: 'dh' }, { k: 'tipo', t: 'Tipo' }, { k: 'motivo', t: 'Motivo' }, { k: 'produto', t: 'Produto' }, { k: 'qtd', t: 'Qtd', tipo: 'int' },
          { k: 'documento', t: 'Documento' }, { k: 'usuario', t: 'Usuário' }, { k: 'obs', t: 'Obs.' }],
        linhas: ls
      };
    }
    case 'consignacao': {
      const ls = agrupar(itens.filter((i) => i.consignanteId), (i) => i.consignanteId).map((g) => ({ ...g, consignante: consignanteNome(g.chave) || '(removido)', loja: g.receita - g.custo }))
        .sort((a, b) => b.receita - a.receita);
      return {
        resumo: [{ t: 'Vendido de consignados', v: brl(ls.reduce((s, l) => s + l.receita, 0)) }, { t: 'A repassar', v: brl(ls.reduce((s, l) => s + l.custo, 0)) }],
        colunas: [{ k: 'consignante', t: 'Consignante' }, { k: 'qtd', t: 'Qtd vendida', tipo: 'int' }, { k: 'receita', t: 'Vendido', tipo: 'brl' }, { k: 'custo', t: 'A repassar', tipo: 'brl' }, { k: 'loja', t: 'Ganho da loja', tipo: 'brl' }],
        linhas: ls, totais: soma(ls, ['qtd', 'receita', 'custo', 'loja'])
      };
    }
    case 'cancelamentos': {
      const ls = vendas.filter((v) => v.status === 'cancelada').map((v) => ({
        _id: v.id, criadoEm: v.criadoEm, numero: v.numero, vendedor: v.vendedorNome, total: v.total, por: v.canceladaPor, motivo: v.motivoCancelamento
      }));
      return {
        resumo: [{ t: 'Cancelamentos', v: String(ls.length) }, { t: 'Valor cancelado', v: brl(ls.reduce((s, l) => s + l.total, 0)) }],
        colunas: [{ k: 'criadoEm', t: 'Data/hora', tipo: 'dh' }, { k: 'numero', t: 'Venda' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'total', t: 'Total', tipo: 'brl' }, { k: 'por', t: 'Cancelada por' }, { k: 'motivo', t: 'Motivo' }],
        linhas: ls, totais: soma(ls, ['total'])
      };
    }
    default: return { colunas: [], linhas: [] };
  }
}
