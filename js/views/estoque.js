// Entrada e saída de mercadorias por código de barras + inventário (contagem).
import { state, store, on, isSocio, nomeProduto, produtoPorCodigo, opsMovimento, MOTIVOS, registrarLog } from '../state.js';
import { $, $$, esc, num, toast, modal, confirmar, casaBusca, lerForm } from '../util.js';
import { ic } from '../icones.js';
import { abrirScanner } from '../scanner.js';
import { formProduto } from './produtos.js';
import { enviarParaEtiquetas } from './etiquetas.js';

const carregar = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };

export function render(main) {
  let aba = sessionStorage.getItem('ee_aba_estoque') || 'entrada';
  main.innerHTML = `<div class="abas" id="abas">
      <button data-a="entrada">Entrada</button><button data-a="saida">Saída / baixa</button><button data-a="inventario">Inventário (contagem)</button>
    </div><div id="corpo"></div>`;
  let limpar = null;
  const abrir = (a) => {
    aba = a; sessionStorage.setItem('ee_aba_estoque', a);
    $$('#abas button', main).forEach((b) => b.classList.toggle('ativo', b.dataset.a === a));
    limpar && limpar();
    limpar = a === 'inventario' ? inventario($('#corpo', main)) : movimento($('#corpo', main), a);
  };
  $('#abas', main).onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) abrir(b.dataset.a); };
  abrir(aba);
  return () => limpar && limpar();
}

// ---------------------------------------------------------------------
function barraLeitura(placeholder) {
  return `<form class="busca-grande" data-f autocomplete="off">
      <input data-busca placeholder="${esc(placeholder)}" enterkeyhint="go">
      <button type="button" class="btn escuro" data-cam>${ic('camera')}<span>Câmera</span></button>
    </form><div class="resultados" data-res></div>`;
}

/** Liga a barra de leitura: chama adicionar(produto) ao ler/selecionar. */
function ligarLeitura(el, { adicionar, naoEncontrado }) {
  const inp = $('[data-busca]', el);
  const res = $('[data-res]', el);
  const buscar = (t) => {
    if (t.length < 2) { res.innerHTML = ''; return []; }
    const r = state.produtos.filter((p) => casaBusca(`${nomeProduto(p)} ${p.codigo || ''}`, t)).slice(0, 30);
    res.innerHTML = r.map((p) => `<button type="button" data-id="${p.id}"><span><b>${esc(nomeProduto(p))}</b><br><small class="muted">${esc(p.codigo || '')}</small></span><span>est. ${Number(p.estoque) || 0}</span></button>`).join('');
    return r;
  };
  $('[data-f]', el).onsubmit = (e) => {
    e.preventDefault();
    const v = inp.value.trim();
    if (!v) return;
    const p = produtoPorCodigo(v);
    if (p) { adicionar(p); inp.value = ''; res.innerHTML = ''; return; }
    const r = buscar(v);
    if (r.length === 1) { adicionar(r[0]); inp.value = ''; res.innerHTML = ''; } else if (!r.length) { naoEncontrado(v); inp.value = ''; }
  };
  inp.oninput = () => { if (!/^\d{6,}$/.test(inp.value.trim())) buscar(inp.value.trim()); };
  res.onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { adicionar(state.porId.get(b.dataset.id)); inp.value = ''; res.innerHTML = ''; } };
  $('[data-cam]', el).onclick = () => abrirScanner({
    continuo: true,
    onCode: (c) => {
      const p = produtoPorCodigo(c);
      if (!p) { return naoEncontrado(c, true) || { ok: false, msg: `Código ${c} não cadastrado` }; }
      const q = adicionar(p);
      return { ok: true, msg: `✔ ${nomeProduto(p)}${q ? ` (${q})` : ''}` };
    }
  });
}

// ---------------------------------------------------------------------
function movimento(el, tipo) {
  const CH = `ee_mov_${tipo}`;
  let itens = carregar(CH); // [{produtoId, qtd}]
  const entrada = tipo === 'entrada';
  el.innerHTML = `<div class="grid g2" style="align-items:start">
    <div class="card">
      <h2>${entrada ? 'Itens recebidos' : 'Itens a baixar'}</h2>
      ${barraLeitura('Leia o código de barras ou busque pelo nome')}
      <div data-lista style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h2>Dados do movimento</h2>
      <div class="grid" style="gap:12px" data-form>
        <label class="campo"><span>Motivo</span><select name="motivo">${MOTIVOS[tipo].map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
        <label class="campo"><span>${entrada ? 'Nota / fornecedor / documento' : 'Documento / referência'}</span><input name="documento" placeholder="Opcional"></label>
        <label class="campo"><span>Observação</span><textarea name="obs" rows="2" placeholder="Opcional"></textarea></label>
        <div class="kpi ${entrada ? '' : 'alerta'}"><div class="t">Total de unidades</div><div class="v" data-total>0</div></div>
        <button class="btn prim grande bloco" data-confirmar>Confirmar ${entrada ? 'entrada' : 'saída'}</button>
        <button class="btn bloco" data-limpar>${ic('lixo')} Limpar lista</button>
      </div>
    </div></div>`;
  const elLista = $('[data-lista]', el);
  const salvar = () => localStorage.setItem(CH, JSON.stringify(itens));

  const desenhar = () => {
    const ls = itens.map((i) => ({ ...i, p: state.porId.get(i.produtoId) })).filter((i) => i.p);
    $('[data-total]', el).textContent = ls.reduce((s, i) => s + i.qtd, 0);
    elLista.innerHTML = ls.length ? ls.map((i) => `<div class="lista-item" data-id="${i.produtoId}">
        <div class="info"><b>${esc(nomeProduto(i.p))}</b><span class="small muted">${esc(i.p.codigo || '')} · estoque atual ${Number(i.p.estoque) || 0} → <b>${(Number(i.p.estoque) || 0) + (entrada ? i.qtd : -i.qtd)}</b></span></div>
        <div class="qtd"><button data-menos>−</button><input data-q value="${i.qtd}" inputmode="numeric"><button data-mais>+</button></div>
        <button class="btn icone peq fantasma" data-rem>${ic('lixo')}</button></div>`).join('')
      : '<div class="vazio">Nenhum item. Leia os códigos com a câmera ou leitor.</div>';
  };
  const adicionar = (p, q = 1) => {
    const ex = itens.find((i) => i.produtoId === p.id);
    if (ex) ex.qtd += q; else itens.unshift({ produtoId: p.id, qtd: q });
    salvar(); desenhar();
    return (ex || itens[0]).qtd;
  };
  ligarLeitura(el, {
    adicionar,
    naoEncontrado: (c, doScanner) => {
      if (entrada && isSocio()) {
        confirmar(`O código ${c} não está cadastrado. Deseja cadastrar o produto agora?`, { ok: 'Cadastrar' }).then((ok) => ok && formProduto({ codigo: c }));
        return doScanner ? { ok: false, msg: `Código ${c} não cadastrado – cadastre ao concluir` } : null;
      }
      toast(`Código ${c} não cadastrado.`, 'erro');
      return null;
    }
  });
  elLista.onclick = (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const it = itens.find((i) => i.produtoId === row.dataset.id);
    if (e.target.closest('[data-mais]')) it.qtd++;
    else if (e.target.closest('[data-menos]')) it.qtd = Math.max(1, it.qtd - 1);
    else if (e.target.closest('[data-rem]')) itens = itens.filter((i) => i !== it);
    else return;
    salvar(); desenhar();
  };
  elLista.onchange = (e) => {
    if (!e.target.matches('[data-q]')) return;
    const it = itens.find((i) => i.produtoId === e.target.closest('[data-id]').dataset.id);
    it.qtd = Math.max(1, Math.round(num(e.target.value)) || 1);
    salvar(); desenhar();
  };
  $('[data-limpar]', el).onclick = async () => { if (itens.length && await confirmar('Limpar a lista?')) { itens = []; salvar(); desenhar(); } };
  $('[data-confirmar]', el).onclick = () => {
    const ls = itens.map((i) => ({ ...i, p: state.porId.get(i.produtoId) })).filter((i) => i.p);
    if (!ls.length) return toast('A lista está vazia.', 'alerta');
    const f = lerForm($('[data-form]', el));
    const agora = Date.now();
    const ops = ls.flatMap((i) => opsMovimento({ produto: i.p, qtd: entrada ? i.qtd : -i.qtd, tipo, motivo: f.motivo, documento: f.documento, obs: f.obs, agora }));
    store.commit(ops);
    const total = ls.reduce((s, i) => s + i.qtd, 0);
    registrarLog(entrada ? 'entrada' : 'saida', `${entrada ? 'Entrada' : 'Saída'} de ${total} unidade(s) em ${ls.length} produto(s) – ${f.motivo}${f.documento ? ` (doc. ${f.documento})` : ''}`,
      { motivo: f.motivo, documento: f.documento, obs: f.obs, itens: ls.map((i) => `${entrada ? '+' : '-'}${i.qtd} ${nomeProduto(i.p)}`) });
    const paraEtq = ls.map((i) => ({ produtoId: i.produtoId, qtd: i.qtd }));
    itens = []; salvar(); desenhar();
    $$('[data-form] input, [data-form] textarea', el).forEach((x) => { x.value = ''; });
    if (entrada) {
      modal({
        titulo: 'Entrada registrada',
        html: `<p>${total} unidade(s) adicionadas ao estoque.</p><p>Deseja imprimir as etiquetas desses itens?</p>`,
        botoes: [{ t: 'Agora não' }, { t: 'Imprimir etiquetas', cls: 'prim', acao: () => enviarParaEtiquetas(paraEtq) }]
      });
    } else toast(`Saída de ${total} unidade(s) registrada.`, 'ok');
  };
  desenhar();
  return on('produtos', desenhar);
}

// ---------------------------------------------------------------------
function inventario(el) {
  const CH = 'ee_inventario';
  let cont = {};
  try { cont = JSON.parse(localStorage.getItem(CH) || '{}'); } catch { cont = {}; }
  let categoria = localStorage.getItem('ee_inv_cat') || '';
  const salvar = () => { localStorage.setItem(CH, JSON.stringify(cont)); localStorage.setItem('ee_inv_cat', categoria); };
  const cats = [...new Set(state.produtos.map((p) => p.categoria).filter(Boolean))].sort();

  el.innerHTML = `<div class="card">
      <p class="muted small" style="margin-top:0">Conte os produtos lendo cada unidade (cada leitura soma 1). No final, o sistema mostra as diferenças e ajusta o estoque.
      A contagem fica salva neste aparelho até ser aplicada.</p>
      <div class="barra">
        <label class="campo"><span>Escopo da contagem</span><select data-cat><option value="">Todos os produtos</option>${cats.map((c) => `<option ${c === categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="check" style="padding-bottom:10px"><input type="checkbox" data-zerar> Produtos do escopo não contados = 0</label>
      </div>
      ${barraLeitura('Leia cada unidade ou busque pelo nome')}
    </div>
    <div class="kpis" data-kpis></div>
    <div class="card" style="padding:0"><div data-tab></div></div>
    <div class="acoes"><button class="btn prim grande" data-aplicar>Aplicar ajustes</button><button class="btn" data-limpar>${ic('lixo')} Descartar contagem</button></div>`;

  const linhas = () => {
    const zerar = $('[data-zerar]', el).checked;
    const escopo = state.produtos.filter((p) => p.ativo !== false && (!categoria || p.categoria === categoria));
    const ids = new Set([...Object.keys(cont), ...(zerar ? escopo.map((p) => p.id) : [])]);
    return [...ids].map((id) => {
      const p = state.porId.get(id);
      if (!p) return null;
      const sistema = Number(p.estoque) || 0;
      const contado = cont[id] ?? 0;
      return { p, sistema, contado, dif: contado - sistema, lido: id in cont };
    }).filter(Boolean).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
  };
  const desenhar = () => {
    const ls = linhas();
    const difs = ls.filter((l) => l.dif);
    $('[data-kpis]', el).innerHTML = `
      <div class="kpi"><div class="t">Itens contados</div><div class="v">${Object.keys(cont).length}</div></div>
      <div class="kpi"><div class="t">Unidades contadas</div><div class="v">${Object.values(cont).reduce((s, x) => s + x, 0)}</div></div>
      <div class="kpi ${difs.length ? 'alerta' : ''}"><div class="t">Com diferença</div><div class="v">${difs.length}</div></div>`;
    $('[data-tab]', el).innerHTML = ls.length ? `<div class="tabela-wrap"><table><thead><tr><th>Produto</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th></tr></thead><tbody>
      ${ls.map((l) => `<tr data-id="${l.p.id}"><td><b>${esc(nomeProduto(l.p))}</b><br><span class="small muted mono">${esc(l.p.codigo || '')}</span>${l.lido ? '' : ' <span class="tag">não contado</span>'}</td>
        <td class="num">${l.sistema}</td><td class="num"><input data-c value="${l.contado}" inputmode="numeric" style="width:80px;text-align:right"></td>
        <td class="num"><span class="tag ${l.dif > 0 ? 'ok' : l.dif < 0 ? 'perigo' : ''}">${l.dif > 0 ? '+' : ''}${l.dif}</span></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum item contado ainda.</div>';
  };
  ligarLeitura(el, {
    adicionar: (p) => { cont[p.id] = (cont[p.id] || 0) + 1; salvar(); desenhar(); return cont[p.id]; },
    naoEncontrado: (c) => { toast(`Código ${c} não cadastrado.`, 'erro'); return null; }
  });
  $('[data-cat]', el).onchange = (e) => { categoria = e.target.value; salvar(); desenhar(); };
  $('[data-zerar]', el).onchange = desenhar;
  $('[data-tab]', el).onchange = (e) => {
    if (!e.target.matches('[data-c]')) return;
    cont[e.target.closest('[data-id]').dataset.id] = Math.max(0, Math.round(num(e.target.value)));
    salvar(); desenhar();
  };
  $('[data-limpar]', el).onclick = async () => { if (await confirmar('Descartar toda a contagem?', { perigo: true, ok: 'Descartar' })) { cont = {}; salvar(); desenhar(); } };
  $('[data-aplicar]', el).onclick = async () => {
    const difs = linhas().filter((l) => l.dif);
    if (!difs.length) return toast('Não há diferenças para ajustar.', 'alerta');
    if (!await confirmar(`Ajustar o estoque de ${difs.length} produto(s) conforme a contagem?`, { ok: 'Aplicar' })) return;
    const agora = Date.now();
    store.commit(difs.flatMap((l) => opsMovimento({ produto: l.p, qtd: l.dif, tipo: 'ajuste', motivo: 'Inventário', obs: `Sistema ${l.sistema} → contado ${l.contado}`, agora })));
    registrarLog('inventario', `Aplicou inventário: ${difs.length} produto(s) ajustado(s), saldo ${difs.reduce((s, l) => s + l.dif, 0) > 0 ? '+' : ''}${difs.reduce((s, l) => s + l.dif, 0)} unidade(s)`,
      { ajustes: difs.map((l) => `${nomeProduto(l.p)}: ${l.sistema} → ${l.contado}`) });
    cont = {}; salvar(); desenhar();
    toast('Inventário aplicado.', 'ok');
  };
  desenhar();
  return on('produtos', desenhar);
}
