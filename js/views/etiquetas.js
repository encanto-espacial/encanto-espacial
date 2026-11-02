// Geração e impressão de etiquetas com código de barras (impressora térmica de etiquetas).
import { state, store, on, isSocio, nomeProduto, produtoPorCodigo } from '../state.js';
import { $, esc, brl, num, toast, casaBusca, imprimir, eanValido, lerForm, gerarEAN } from '../util.js';
import { codigosExistentes } from '../state.js';
import { ic } from '../icones.js';
import { abrirScanner } from '../scanner.js';

const FILA = 'ee_etq_fila';

/** Adiciona itens à fila de etiquetas e abre a tela. */
export function enviarParaEtiquetas(itens) {
  let fila = [];
  try { fila = JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { fila = []; }
  for (const it of itens) {
    const ex = fila.find((f) => f.produtoId === it.produtoId);
    if (ex) ex.qtd += it.qtd; else fila.push({ ...it });
  }
  localStorage.setItem(FILA, JSON.stringify(fila));
  location.hash = '#/etiquetas';
}

function svgBarras(codigo, alturaMm) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    window.JsBarcode(svg, codigo, { format: eanValido(codigo) ? 'EAN13' : 'CODE128', displayValue: false, margin: 0, height: 60, width: 2, flat: true });
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.cssText = `width:100%;height:${alturaMm}mm;display:block`;
    svg.removeAttribute('x'); svg.removeAttribute('y');
    return svg.outerHTML;
  } catch {
    return `<div style="font-size:7pt;color:#c00">código inválido</div>`;
  }
}

function etiquetaHTML(p, e) {
  const alturaBarra = Math.max(6, e.altura * (e.mostrarNome ? 0.36 : 0.45));
  return `<div class="etiqueta" style="width:${e.largura}mm;height:${e.altura}mm">
    ${e.mostrarLoja ? `<div class="e-loja">${esc(state.config.nome)}</div>` : ''}
    ${e.mostrarNome ? `<div class="e-nome">${esc(nomeProduto(p))}</div>` : ''}
    <div style="width:92%">${p.codigo ? svgBarras(p.codigo, alturaBarra) : '<i style="font-size:7pt">sem código</i>'}
      <div style="font-size:6.5pt;letter-spacing:.5px;line-height:1.1">${esc(p.codigo || '')}</div></div>
    ${e.mostrarPreco ? `<div class="e-preco">${esc(brl(p.preco))}</div>` : ''}
  </div>`;
}

export function render(main) {
  let fila = [];
  try { fila = JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { fila = []; }
  let cfg = { ...state.config.etiqueta };
  const salvarFila = () => localStorage.setItem(FILA, JSON.stringify(fila));
  const cats = [...new Set(state.produtos.map((p) => p.categoria).filter(Boolean))].sort();

  main.innerHTML = `<div class="grid g2" style="align-items:start">
    <div>
      <div class="card">
        <h2>Produtos</h2>
        <form class="busca-grande" id="fEtq" autocomplete="off">
          <input id="bEtq" placeholder="Código ou nome do produto">
          <button type="button" class="btn escuro" id="camEtq">${ic('camera')}</button>
        </form>
        <div class="resultados" id="resEtq"></div>
        <div class="barra" style="margin-top:12px">
          <label class="campo cresce"><span>Adicionar em lote</span><select id="selCat"><option value="">Todas as categorias</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
          <button class="btn" id="btnLote">Qtd. = estoque</button>
          <button class="btn" id="btnLote1">1 de cada</button>
        </div>
        <div id="filaEtq"></div>
        <div class="acoes" style="margin-top:10px"><span class="muted small" id="totEtq"></span><span class="espaco"></span><button class="btn peq" id="btnLimparEtq">${ic('lixo')} Limpar</button></div>
      </div>
    </div>
    <div>
      <div class="card">
        <h2>Formato da etiqueta</h2>
        <div class="form" id="fCfg">
          <label class="campo"><span>Largura (mm)</span><input name="largura" inputmode="decimal" value="${cfg.largura}"></label>
          <label class="campo"><span>Altura (mm)</span><input name="altura" inputmode="decimal" value="${cfg.altura}"></label>
          <label class="campo"><span>Colunas no rolo</span><input name="colunas" inputmode="numeric" value="${cfg.colunas}"></label>
          <label class="campo"><span>Espaço entre colunas (mm)</span><input name="espaco" inputmode="decimal" value="${cfg.espaco}"></label>
          <label class="check"><input type="checkbox" name="mostrarLoja" ${cfg.mostrarLoja ? 'checked' : ''}> Nome da loja</label>
          <label class="check"><input type="checkbox" name="mostrarNome" ${cfg.mostrarNome ? 'checked' : ''}> Nome do produto</label>
          <label class="check"><input type="checkbox" name="mostrarPreco" ${cfg.mostrarPreco ? 'checked' : ''}> Preço</label>
        </div>
        <p class="dica">Na janela de impressão escolha a impressora térmica, margens "Nenhuma" e escala 100%. Ajuste o tamanho do papel do driver para o tamanho da etiqueta.</p>
        <div class="acoes">${isSocio() ? '<button class="btn peq" id="btnPadrao">Salvar como padrão</button>' : ''}</div>
      </div>
      <div class="card">
        <div class="acoes" style="margin-bottom:10px"><h2 style="margin:0">Pré-visualização</h2><span class="espaco"></span>
          <button class="btn prim" id="btnImprimir">${ic('imprimir')} Imprimir</button></div>
        <div class="etq-preview" id="prev"></div>
      </div>
    </div></div>`;

  const lerCfg = () => {
    const f = lerForm($('#fCfg', main));
    cfg = {
      largura: Math.max(15, num(f.largura)), altura: Math.max(10, num(f.altura)), colunas: Math.max(1, Math.round(num(f.colunas))),
      espaco: Math.max(0, num(f.espaco)), mostrarLoja: f.mostrarLoja, mostrarNome: f.mostrarNome, mostrarPreco: f.mostrarPreco
    };
  };
  const itens = () => fila.map((f) => ({ ...f, p: state.porId.get(f.produtoId) })).filter((f) => f.p);

  const desenhar = () => {
    const ls = itens();
    $('#totEtq', main).textContent = `${ls.reduce((s, i) => s + i.qtd, 0)} etiqueta(s)`;
    $('#filaEtq', main).innerHTML = ls.length ? ls.map((i) => `<div class="lista-item" data-id="${i.produtoId}">
      <div class="info"><b>${esc(nomeProduto(i.p))}</b><span class="small muted mono">${esc(i.p.codigo || 'sem código')} · ${esc(brl(i.p.preco))}</span></div>
      ${!i.p.codigo && isSocio() ? '<button class="btn peq" data-gerar>Gerar código</button>' : ''}
      <input data-q value="${i.qtd}" inputmode="numeric" style="width:70px;text-align:right">
      <button class="btn icone peq fantasma" data-rem>${ic('lixo')}</button></div>`).join('')
      : '<div class="vazio">Adicione produtos para gerar etiquetas.</div>';
    const prev = ls.slice(0, 8);
    $('#prev', main).innerHTML = prev.length ? prev.map((i) => etiquetaHTML(i.p, cfg)).join('') : '<span class="muted small">Sem etiquetas</span>';
  };

  const adicionar = (p, q = 1) => {
    const ex = fila.find((f) => f.produtoId === p.id);
    if (ex) ex.qtd += q; else fila.push({ produtoId: p.id, qtd: q });
    salvarFila(); desenhar();
  };
  $('#fEtq', main).onsubmit = (e) => {
    e.preventDefault();
    const v = $('#bEtq', main).value.trim();
    const p = produtoPorCodigo(v);
    if (p) { adicionar(p); $('#bEtq', main).value = ''; $('#resEtq', main).innerHTML = ''; }
  };
  $('#bEtq', main).oninput = (e) => {
    const t = e.target.value.trim();
    const r = t.length < 2 ? [] : state.produtos.filter((p) => p.ativo !== false && casaBusca(`${nomeProduto(p)} ${p.codigo || ''}`, t)).slice(0, 30);
    $('#resEtq', main).innerHTML = r.map((p) => `<button type="button" data-id="${p.id}"><span>${esc(nomeProduto(p))}</span><span class="muted">est. ${Number(p.estoque) || 0}</span></button>`).join('');
  };
  $('#resEtq', main).onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { adicionar(state.porId.get(b.dataset.id)); $('#bEtq', main).value = ''; $('#resEtq', main).innerHTML = ''; } };
  $('#camEtq', main).onclick = () => abrirScanner({
    continuo: true,
    onCode: (c) => { const p = produtoPorCodigo(c); if (!p) return { ok: false, msg: `Código ${c} não cadastrado` }; adicionar(p); return { ok: true, msg: `✔ ${nomeProduto(p)}` }; }
  });
  const lote = (porEstoque) => {
    const cat = $('#selCat', main).value;
    const ps = state.produtos.filter((p) => p.ativo !== false && (!cat || p.categoria === cat) && (!porEstoque || (Number(p.estoque) || 0) > 0));
    fila = ps.map((p) => ({ produtoId: p.id, qtd: porEstoque ? Number(p.estoque) : 1 }));
    salvarFila(); desenhar();
    toast(`${ps.length} produto(s) adicionados.`, 'ok');
  };
  $('#btnLote', main).onclick = () => lote(true);
  $('#btnLote1', main).onclick = () => lote(false);
  $('#btnLimparEtq', main).onclick = () => { fila = []; salvarFila(); desenhar(); };
  $('#filaEtq', main).onclick = (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    if (e.target.closest('[data-rem]')) { fila = fila.filter((f) => f.produtoId !== row.dataset.id); salvarFila(); desenhar(); }
    if (e.target.closest('[data-gerar]')) {
      store.commit([{ op: 'update', col: 'produtos', id: row.dataset.id, data: { codigo: gerarEAN(codigosExistentes()), atualizadoEm: Date.now() } }]);
    }
  };
  $('#filaEtq', main).onchange = (e) => {
    if (!e.target.matches('[data-q]')) return;
    const f = fila.find((x) => x.produtoId === e.target.closest('[data-id]').dataset.id);
    f.qtd = Math.max(0, Math.round(num(e.target.value)));
    salvarFila(); desenhar();
  };
  $('#fCfg', main).oninput = () => { lerCfg(); desenhar(); };
  const bp = $('#btnPadrao', main);
  if (bp) bp.onclick = () => { lerCfg(); store.commit([{ op: 'set', col: 'config', id: 'loja', data: { etiqueta: cfg }, merge: true }]); toast('Formato salvo como padrão.', 'ok'); };

  $('#btnImprimir', main).onclick = () => {
    lerCfg();
    const todas = itens().flatMap((i) => Array(i.qtd).fill(i.p));
    if (!todas.length) return toast('Nenhuma etiqueta para imprimir.', 'alerta');
    if (todas.length > 2000) return toast('Máximo de 2000 etiquetas por impressão.', 'alerta');
    const W = cfg.colunas * cfg.largura + (cfg.colunas - 1) * cfg.espaco;
    let html = '';
    for (let i = 0; i < todas.length; i += cfg.colunas) {
      html += `<div class="pagina-etq" style="width:${W}mm;height:${cfg.altura}mm;gap:${cfg.espaco}mm">${todas.slice(i, i + cfg.colunas).map((p) => etiquetaHTML(p, cfg)).join('')}</div>`;
    }
    imprimir(html, `@page { size: ${W}mm ${cfg.altura}mm; margin: 0; } html, body { margin: 0; padding: 0; }`);
  };

  desenhar();
  return on(['produtos', 'config'], desenhar);
}
