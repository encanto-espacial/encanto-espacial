// Cálculos de vendas, lucro e estoque usados no painel e nos relatórios.
import { state, custoDe } from './state.js';
import { diaISO, inicioDia, fimDia, somaDias, deISO } from './util.js';
import { store } from './store/index.js';

export const vendasValidas = (vendas) => vendas.filter((v) => v.status !== 'cancelada');

/** Itens vendidos com receita líquida (desconto rateado), custo e lucro. */
export function itensVendidos(vendas) {
  const out = [];
  for (const v of vendasValidas(vendas)) {
    const fator = v.subtotal > 0 ? v.total / v.subtotal : 1;
    for (const it of v.itens || []) {
      const receita = it.qtd * it.preco * fator;
      const custo = custoDe(it.produtoId) * it.qtd;
      out.push({ ...it, vendaId: v.id, dia: v.dia, criadoEm: v.criadoEm, pagamento: v.pagamento, vendedorNome: v.vendedorNome, receita, custo, lucro: receita - custo });
    }
  }
  return out;
}

export function resumo(vendas) {
  const ok = vendasValidas(vendas);
  const itens = itensVendidos(vendas);
  const faturamento = ok.reduce((s, v) => s + v.total, 0);
  const custo = itens.reduce((s, i) => s + i.custo, 0);
  return {
    vendas: ok.length,
    canceladas: vendas.length - ok.length,
    faturamento,
    descontos: ok.reduce((s, v) => s + (v.desconto || 0), 0),
    itens: itens.reduce((s, i) => s + i.qtd, 0),
    ticket: ok.length ? faturamento / ok.length : 0,
    custo,
    lucro: faturamento - custo,
    margem: faturamento ? (faturamento - custo) / faturamento : 0
  };
}

/** Agrupa e soma: chave(item) -> {chave, ...somas} */
export function agrupar(arr, chave, campos = ['qtd', 'receita', 'custo', 'lucro']) {
  const m = new Map();
  for (const x of arr) {
    const k = chave(x);
    if (!m.has(k)) m.set(k, Object.fromEntries([['chave', k], ...campos.map((c) => [c, 0])]));
    const g = m.get(k);
    for (const c of campos) g[c] += Number(x[c]) || 0;
  }
  return [...m.values()];
}

/** Lista de dias ISO entre duas datas (inclusive). */
export function diasEntre(de, ate) {
  const out = [];
  for (let d = inicioDia(de); d <= ate; d = somaDias(d, 1)) out.push(diaISO(d));
  return out;
}

/** Períodos rápidos. */
export function periodo(chave, deStr, ateStr) {
  const hoje = new Date();
  switch (chave) {
    case 'hoje': return { de: inicioDia(hoje), ate: fimDia(hoje) };
    case 'ontem': { const o = somaDias(hoje, -1); return { de: inicioDia(o), ate: fimDia(o) }; }
    case '7d': return { de: inicioDia(somaDias(hoje, -6)), ate: fimDia(hoje) };
    case '30d': return { de: inicioDia(somaDias(hoje, -29)), ate: fimDia(hoje) };
    case 'mes': return { de: new Date(hoje.getFullYear(), hoje.getMonth(), 1), ate: fimDia(hoje) };
    case 'mesant': return { de: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), ate: fimDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
    case 'ano': return { de: new Date(hoje.getFullYear(), 0, 1), ate: fimDia(hoje) };
    default: return { de: inicioDia(deISO(deStr)), ate: fimDia(deISO(ateStr)) };
  }
}

/**
 * Busca vendas no período (sócio vê todas). Vendedor só pode ler as próprias:
 * nesse caso a consulta é por dia (de), o que dispensa índice composto no Firestore.
 */
function filtroVendas(de, ate, somenteMinhas) {
  if (somenteMinhas) return [['vendedorUid', '==', state.user.uid], ['dia', '==', diaISO(de)]];
  return [['criadoEm', '>=', de.getTime()], ['criadoEm', '<=', ate.getTime()]];
}
export function buscarVendas(de, ate, { somenteMinhas = false } = {}) {
  return store.query('vendas', { where: filtroVendas(de, ate, somenteMinhas) });
}
export function assinarVendas(de, ate, cb, { somenteMinhas = false } = {}) {
  return store.subscribe('vendas', { where: filtroVendas(de, ate, somenteMinhas) }, cb);
}
export function buscarMovimentos(de, ate) {
  return store.query('movimentos', { where: [['criadoEm', '>=', de.getTime()], ['criadoEm', '<=', ate.getTime()]] });
}

export function valorEstoque() {
  let custo = 0, venda = 0, unidades = 0;
  for (const p of state.produtos) {
    if (p.ativo === false) continue;
    const e = Math.max(0, Number(p.estoque) || 0);
    unidades += e; custo += e * custoDe(p.id); venda += e * (Number(p.preco) || 0);
  }
  return { custo, venda, unidades };
}
