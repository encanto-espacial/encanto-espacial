// Estado global do app (dados sincronizados) + ações de negócio que geram gravações.
import { store } from './store/index.js';
import { LOJA_PADRAO } from './config.js';
import { diaISO, numeroVenda, arred, normalizaCodigo } from './util.js';

export { store };

export const state = {
  user: null,          // {uid, email}
  perfil: null,        // documento usuarios/{uid}
  produtos: [],
  porId: new Map(),
  porCodigo: new Map(),
  custos: {},          // produtoId -> {custo}  (somente sócios)
  consignantes: [],
  usuarios: [],
  config: clone(LOJA_PADRAO),
  status: { online: navigator.onLine, pendentes: 0 }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ---------- Eventos simples ----------
const ouvintes = new Map();
export function on(chaves, fn) {
  const lista = Array.isArray(chaves) ? chaves : [chaves];
  for (const k of lista) {
    if (!ouvintes.has(k)) ouvintes.set(k, new Set());
    ouvintes.get(k).add(fn);
  }
  return () => lista.forEach((k) => ouvintes.get(k)?.delete(fn));
}
export function emit(k) { ouvintes.get(k)?.forEach((fn) => { try { fn(k); } catch (e) { console.error(e); } }); }

// ---------- Perfis ----------
export const isSocio = () => state.perfil?.papel === 'socio' && state.perfil?.ativo !== false;
export const nomeUsuario = () => state.perfil?.nome || state.user?.email || '';

// ---------- Produtos ----------
const ORDEM_TAM = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG'];
const ordTam = (t) => { const i = ORDEM_TAM.indexOf(String(t || '').toUpperCase()); return i >= 0 ? i : 100 + (parseFloat(t) || 0); };
export const variante = (p) => [p.tipo, p.cor, p.tamanho].filter(Boolean).join(' / ');
export const nomeProduto = (p) => (p ? (variante(p) ? `${p.nome} – ${variante(p)}` : p.nome) : '(produto removido)');
export const custoDe = (id) => Number(state.custos[id]?.custo) || 0;
export const produtoPorCodigo = (c) => state.porCodigo.get(normalizaCodigo(c));
export const codigosExistentes = () => new Set(state.produtos.map((p) => p.codigo).filter(Boolean));
export const consignanteNome = (id) => state.consignantes.find((c) => c.id === id)?.nome || '';
export const estoqueBaixo = (p) => p.ativo !== false && (Number(p.estoque) || 0) <= (Number(p.estoqueMin) || 0);

function ordenaProdutos(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR') || String(a.tipo || '').localeCompare(String(b.tipo || ''), 'pt-BR')
    || String(a.cor || '').localeCompare(String(b.cor || ''), 'pt-BR') || ordTam(a.tamanho) - ordTam(b.tamanho);
}

// ---------- Assinaturas ----------
let unsubs = [];
export function pararDados() { unsubs.forEach((u) => u()); unsubs = []; }
export function iniciarDados() {
  pararDados();
  unsubs.push(store.subscribe('produtos', {}, (arr) => {
    state.produtos = arr.filter((p) => p.nome).sort(ordenaProdutos);
    state.porId = new Map(state.produtos.map((p) => [p.id, p]));
    state.porCodigo = new Map(state.produtos.filter((p) => p.codigo).map((p) => [p.codigo, p]));
    emit('produtos');
  }));
  unsubs.push(store.subscribeDoc('config', 'loja', (d) => {
    state.config = { ...clone(LOJA_PADRAO), ...(d || {}), etiqueta: { ...LOJA_PADRAO.etiqueta, ...(d?.etiqueta || {}) } };
    emit('config');
  }));
  unsubs.push(store.subscribe('consignantes', {}, (arr) => {
    state.consignantes = arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    emit('consignantes');
  }));
  if (isSocio()) {
    unsubs.push(store.subscribe('custos', {}, (arr) => {
      state.custos = Object.fromEntries(arr.map((c) => [c.id, c]));
      emit('custos');
    }));
    unsubs.push(store.subscribe('usuarios', {}, (arr) => {
      state.usuarios = arr.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
      emit('usuarios');
    }));
  }
}

store.onStatus((s) => { state.status = s; emit('status'); });

// =====================================================================
//  AÇÕES DE NEGÓCIO
// =====================================================================
const quem = () => ({ usuarioUid: state.user.uid, usuarioNome: nomeUsuario() });

/** Gera as operações de um movimento de estoque (qtd com sinal: + entra, − sai). */
export function opsMovimento({ produto, qtd, tipo, motivo = '', obs = '', documento = '', vendaId = null, agora = Date.now() }) {
  const id = store.newId();
  return [
    { op: 'update', col: 'produtos', id: produto.id, data: { estoque: store.inc(qtd), atualizadoEm: agora } },
    {
      op: 'set', col: 'movimentos', id, data: {
        tipo, motivo, obs, documento, vendaId, qtd,
        produtoId: produto.id, produtoNome: nomeProduto(produto), codigo: produto.codigo || '',
        consignanteId: produto.consignanteId || null,
        criadoEm: agora, dia: diaISO(new Date(agora)), ...quem()
      }
    }
  ];
}

/** Registra uma venda: grava a venda, baixa o estoque e cria os movimentos. */
export function registrarVenda({ itens, desconto = 0, pagamento, recebido = 0, cliente = '', obs = '' }) {
  const agora = Date.now();
  const subtotal = arred(itens.reduce((s, i) => s + i.qtd * i.preco, 0));
  const total = arred(Math.max(0, subtotal - desconto));
  const id = store.newId();
  const venda = {
    numero: numeroVenda(new Date(agora)),
    criadoEm: agora, dia: diaISO(new Date(agora)), hora: new Date(agora).getHours(),
    vendedorUid: state.user.uid, vendedorNome: nomeUsuario(),
    itens: itens.map((i) => ({
      produtoId: i.produto.id, nome: nomeProduto(i.produto), codigo: i.produto.codigo || '',
      categoria: i.produto.categoria || '', consignanteId: i.produto.consignanteId || null,
      qtd: i.qtd, preco: arred(i.preco)
    })),
    qtdItens: itens.reduce((s, i) => s + i.qtd, 0),
    subtotal, desconto: arred(desconto), total, pagamento,
    recebido: pagamento === 'dinheiro' ? arred(recebido) : total,
    troco: pagamento === 'dinheiro' ? arred(Math.max(0, recebido - total)) : 0,
    cliente, obs, status: 'ok'
  };
  const ops = [{ op: 'set', col: 'vendas', id, data: venda }];
  for (const i of itens) ops.push(...opsMovimento({ produto: i.produto, qtd: -i.qtd, tipo: 'venda', motivo: 'Venda', vendaId: id, documento: venda.numero, agora }));
  store.commit(ops);
  registrarLog('venda', `Venda ${venda.numero}: ${venda.qtdItens} item(ns), total R$ ${venda.total.toFixed(2).replace('.', ',')} (${PAGAMENTOS[pagamento] || pagamento})${venda.desconto ? `, desconto R$ ${venda.desconto.toFixed(2).replace('.', ',')}` : ''}`,
    { vendaId: id, numero: venda.numero, total: venda.total, desconto: venda.desconto, pagamento, itens: venda.itens.map((i) => `${i.qtd}x ${i.nome} (R$ ${i.preco})`) });
  return { ...venda, id };
}

/** Cancela uma venda (somente sócio) e devolve os itens ao estoque. */
export function cancelarVenda(venda, motivo) {
  const agora = Date.now();
  const ops = [{
    op: 'update', col: 'vendas', id: venda.id,
    data: { status: 'cancelada', canceladaEm: agora, canceladaPor: nomeUsuario(), motivoCancelamento: motivo }
  }];
  for (const it of venda.itens) {
    const produto = state.porId.get(it.produtoId);
    if (produto) ops.push(...opsMovimento({ produto, qtd: it.qtd, tipo: 'cancelamento', motivo: 'Cancelamento de venda', obs: motivo, vendaId: venda.id, documento: venda.numero, agora }));
  }
  registrarLog('venda_cancelada', `Cancelou a venda ${venda.numero} de ${venda.vendedorNome} (R$ ${Number(venda.total).toFixed(2).replace('.', ',')}). Motivo: ${motivo}`,
    { vendaId: venda.id, numero: venda.numero, total: venda.total, motivo });
  return store.commit(ops);
}

export const PAGAMENTOS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito' };
// =====================================================================
//  LOG DE ATIVIDADES (auditoria para os sócios)
// =====================================================================
export const LOG_ACOES = {
  login: ['Acesso', 'Entrou no sistema'],
  logout: ['Acesso', 'Saiu do sistema'],
  venda: ['Vendas', 'Venda registrada'],
  venda_cancelada: ['Vendas', 'Venda cancelada'],
  produto_criado: ['Produtos', 'Produto cadastrado'],
  produto_editado: ['Produtos', 'Produto alterado'],
  produto_status: ['Produtos', 'Produto ativado/inativado'],
  produto_excluido: ['Produtos', 'Produto excluído'],
  produtos_importados: ['Produtos', 'Importação de planilha'],
  codigo_gerado: ['Produtos', 'Código de barras gerado'],
  entrada: ['Estoque', 'Entrada de mercadoria'],
  saida: ['Estoque', 'Saída / baixa'],
  inventario: ['Estoque', 'Inventário aplicado'],
  etiquetas: ['Etiquetas', 'Etiquetas impressas'],
  consignante: ['Consignação', 'Consignante salvo'],
  acerto: ['Consignação', 'Acerto registrado'],
  usuario: ['Usuários', 'Usuário alterado'],
  usuario_removido: ['Usuários', 'Usuário removido'],
  config: ['Sistema', 'Configurações alteradas'],
  backup_exportado: ['Sistema', 'Backup exportado'],
  backup_importado: ['Sistema', 'Backup importado'],
  exemplo: ['Sistema', 'Dados de exemplo carregados'],
  relatorio: ['Sistema', 'Relatório exportado']
};

function dispositivo() {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Outro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const app = matchMedia('(display-mode: standalone)').matches ? ' (app)' : '';
  return `${so}${nav ? ' · ' + nav : ''}${app}`;
}

/**
 * Registra uma ação no log. Gravação separada e silenciosa: uma falha no log
 * nunca interfere na operação principal (venda, entrada etc.).
 */
export function registrarLog(acao, descricao, detalhes = {}) {
  try {
    if (!state.user || !state.perfil) return Promise.resolve();
    const agora = Date.now();
    const p = store.commit([{
      op: 'set', col: 'logs', id: store.newId(), data: {
        acao, categoria: (LOG_ACOES[acao] || ['Sistema'])[0], descricao: String(descricao || '').slice(0, 500),
        detalhes: JSON.parse(JSON.stringify(detalhes || {})),
        usuarioUid: state.user.uid, usuarioNome: nomeUsuario(), usuarioEmail: state.user.email || '', papel: state.perfil.papel,
        dispositivo: dispositivo(), online: navigator.onLine, criadoEm: agora, dia: diaISO(new Date(agora))
      }
    }], { silencioso: true });
    p.catch(() => {});
    return p;
  } catch (e) { console.warn('log', e); return Promise.resolve(); }
}

export const PAPEIS = { socio: 'Sócio', vendedor: 'Vendedor', pendente: 'Aguardando aprovação' };
export const MOTIVOS = {
  entrada: ['Compra de fornecedor', 'Consignação recebida', 'Produção própria', 'Devolução de cliente', 'Ajuste'],
  saida: ['Perda / avaria', 'Quebra', 'Brinde / doação', 'Uso interno', 'Devolução ao consignante', 'Devolução ao fornecedor', 'Ajuste']
};
