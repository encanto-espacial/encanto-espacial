// Ponto de venda: leitura por câmera/leitor, carrinho, desconto, pagamento e comprovante.
import { state, on, isSocio, produtoPorCodigo, nomeProduto, registrarVenda, PAGAMENTOS } from '../state.js';
import { $, esc, brl, num, arred, toast, modal, casaBusca, debounce, dec } from '../util.js';
import { ic } from '../icones.js';
import { abrirScanner } from '../scanner.js';
import { imprimirComprovante, whatsappComprovante } from '../comprovante.js';

const CHAVE = 'ee_carrinho';
const ponteiroFino = matchMedia('(pointer: fine)').matches;

export function render(main) {
  let carrinho = [];
  try { carrinho = JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch { carrinho = []; }
  let pagamento = 'pix';
  let descTipo = 'R$';

  main.innerHTML = `<div class="pdv">
    <div>
      <div class="card">
        <form class="busca-grande" id="fBusca" autocomplete="off">
          <input id="busca" placeholder="Código de barras ou nome do produto" enterkeyhint="go">
          <button type="button" class="btn escuro" id="btnCam" title="Ler com a câmera">${ic('camera')}<span>Câmera</span></button>
        </form>
        <div class="resultados" id="resultados"></div>
      </div>
      <div class="card">
        <div class="acoes" style="margin-bottom:6px"><h2 style="margin:0">Carrinho</h2><span class="espaco"></span>
          <button class="btn peq fantasma" id="btnLimpar">${ic('lixo')} Limpar</button></div>
        <div id="itens"></div>
      </div>
    </div>
    <div class="total-box">
      <div class="linha"><span>Itens</span><span id="tItens">0</span></div>
      <div class="linha"><span>Subtotal</span><span id="tSub">R$ 0,00</span></div>
      <div class="linha" style="align-items:center;gap:8px"><span>Desconto</span>
        <span class="input-acao" style="max-width:170px">
          <input id="desc" inputmode="decimal" placeholder="0,00" style="text-align:right">
          <select id="descTipo" style="width:64px;padding:6px"><option>R$</option><option>%</option></select>
        </span></div>
      <div class="total" id="tTotal">R$ 0,00</div>
      <div class="pagamentos" id="pagtos">${Object.entries(PAGAMENTOS).map(([k, t]) => `<button type="button" data-p="${k}">${t}</button>`).join('')}</div>
      <div id="boxDinheiro" class="hidden">
        <label class="campo"><span>Valor recebido</span><input id="recebido" inputmode="decimal" placeholder="0,00"></label>
        <div class="linha" style="margin-top:6px"><span>Troco</span><span class="troco" id="troco">R$ 0,00</span></div>
      </div>
      <button class="btn prim grande bloco" id="btnFinalizar" style="margin-top:10px">Finalizar venda</button>
    </div>
  </div>`;

  const elBusca = $('#busca', main);
  const elRes = $('#resultados', main);
  const elItens = $('#itens', main);
  const foco = () => ponteiroFino && elBusca.focus();

  const salvar = () => localStorage.setItem(CHAVE, JSON.stringify(carrinho));
  const linhas = () => carrinho.map((c) => ({ ...c, produto: state.porId.get(c.produtoId) })).filter((c) => c.produto);

  function totais() {
    const ls = linhas();
    const subtotal = arred(ls.reduce((s, l) => s + l.qtd * l.preco, 0));
    const d = num($('#desc', main).value);
    const desconto = arred(Math.min(subtotal, descTipo === '%' ? subtotal * d / 100 : d));
    return { ls, subtotal, desconto, total: arred(subtotal - desconto), qtd: ls.reduce((s, l) => s + l.qtd, 0) };
  }

  function desenhar() {
    const t = totais();
    elItens.innerHTML = t.ls.length ? t.ls.map((l, i) => {
      const est = Number(l.produto.estoque) || 0;
      return `<div class="carrinho-item" data-i="${i}">
        <div><div class="nome">${esc(nomeProduto(l.produto))}</div>
          <div class="small muted">${esc(brl(l.preco))} un. · estoque ${est}${est < l.qtd ? ' <span class="tag alerta">estoque insuficiente</span>' : ''}${l.produto.consignanteId ? ' <span class="tag roxo">consignado</span>' : ''}</div></div>
        <div class="qtd"><button data-menos>−</button><input data-q value="${l.qtd}" inputmode="numeric"><button data-mais>+</button></div>
        <div class="right"><b>${esc(brl(l.qtd * l.preco))}</b><br><button class="btn icone peq fantasma" data-rem title="Remover">${ic('lixo')}</button></div>
      </div>`;
    }).join('') : `<div class="vazio">${ic('carrinho')}<br>Leia um código de barras ou busque pelo nome para começar.</div>`;
    $('#tItens', main).textContent = t.qtd;
    $('#tSub', main).textContent = brl(t.subtotal);
    $('#tTotal', main).textContent = brl(t.total);
    $$p('[data-p]').forEach((b) => b.classList.toggle('ativo', b.dataset.p === pagamento));
    $('#boxDinheiro', main).classList.toggle('hidden', pagamento !== 'dinheiro');
    const rec = num($('#recebido', main).value);
    $('#troco', main).textContent = brl(Math.max(0, rec - t.total));
  }
  const $$p = (s) => Array.from(main.querySelectorAll(s));

  function adicionar(p, qtd = 1) {
    if (p.ativo === false) toast('Atenção: produto inativo.', 'alerta');
    const ex = carrinho.find((c) => c.produtoId === p.id);
    if (ex) ex.qtd += qtd; else carrinho.push({ produtoId: p.id, qtd, preco: Number(p.preco) || 0 });
    const noCarrinho = (ex ? ex.qtd : qtd);
    if ((Number(p.estoque) || 0) < noCarrinho) toast(`Estoque do sistema: ${p.estoque || 0}. Verifique a contagem.`, 'alerta');
    salvar(); desenhar();
    return noCarrinho;
  }

  function buscar(termo) {
    termo = termo.trim();
    if (termo.length < 2) { elRes.innerHTML = ''; return []; }
    const r = state.produtos.filter((p) => p.ativo !== false && (p.codigo === termo || casaBusca(`${nomeProduto(p)} ${p.categoria || ''} ${p.codigo || ''}`, termo))).slice(0, 40);
    elRes.innerHTML = r.length ? r.map((p) => `<button type="button" data-id="${p.id}"><span><b>${esc(nomeProduto(p))}</b><br><small class="muted">${esc(p.codigo || 'sem código')} · estoque ${Number(p.estoque) || 0}</small></span><b>${esc(brl(p.preco))}</b></button>`).join('')
      : '<div class="vazio">Nenhum produto encontrado.</div>';
    return r;
  }

  $('#fBusca', main).onsubmit = (e) => {
    e.preventDefault();
    const v = elBusca.value.trim();
    if (!v) return;
    const p = produtoPorCodigo(v);
    if (p) { adicionar(p); elBusca.value = ''; elRes.innerHTML = ''; return; }
    const r = buscar(v);
    if (r.length === 1) { adicionar(r[0]); elBusca.value = ''; elRes.innerHTML = ''; } else if (!r.length) toast('Produto não encontrado.', 'erro');
  };
  elBusca.oninput = debounce(() => { if (!/^\d{6,}$/.test(elBusca.value.trim())) buscar(elBusca.value); }, 180);
  elRes.onclick = (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    adicionar(state.porId.get(b.dataset.id));
    elBusca.value = ''; elRes.innerHTML = ''; foco();
  };
  $('#btnCam', main).onclick = () => abrirScanner({
    titulo: 'Adicionar ao carrinho', continuo: true,
    onCode: (c) => {
      const p = produtoPorCodigo(c);
      if (!p) return { ok: false, msg: `Código ${c} não cadastrado` };
      const q = adicionar(p);
      return { ok: true, msg: `✔ ${nomeProduto(p)} (${q} no carrinho)` };
    }
  });

  elItens.onclick = (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const l = linhas()[Number(row.dataset.i)];
    const c = carrinho.find((x) => x.produtoId === l.produtoId);
    if (e.target.closest('[data-mais]')) c.qtd++;
    else if (e.target.closest('[data-menos]')) c.qtd = Math.max(1, c.qtd - 1);
    else if (e.target.closest('[data-rem]')) carrinho = carrinho.filter((x) => x !== c);
    else return;
    salvar(); desenhar();
  };
  elItens.onchange = (e) => {
    if (!e.target.matches('[data-q]')) return;
    const l = linhas()[Number(e.target.closest('[data-i]').dataset.i)];
    const c = carrinho.find((x) => x.produtoId === l.produtoId);
    c.qtd = Math.max(1, Math.round(num(e.target.value)) || 1);
    salvar(); desenhar();
  };
  $('#btnLimpar', main).onclick = () => { carrinho = []; salvar(); $('#desc', main).value = ''; desenhar(); foco(); };
  $('#desc', main).oninput = desenhar;
  $('#descTipo', main).onchange = (e) => { descTipo = e.target.value; desenhar(); };
  $('#recebido', main).oninput = desenhar;
  $('#pagtos', main).onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    pagamento = b.dataset.p; desenhar();
    if (pagamento === 'dinheiro') $('#recebido', main).focus();
  };

  $('#btnFinalizar', main).onclick = () => {
    const t = totais();
    if (!t.ls.length) return toast('O carrinho está vazio.', 'alerta');
    const maxPct = Number(state.config.descontoMaxVendedor) || 0;
    if (!isSocio() && t.subtotal && t.desconto / t.subtotal > maxPct / 100 + 1e-9) {
      return toast(`Desconto máximo para vendedor: ${maxPct}%. Peça autorização a um sócio.`, 'erro', 5000);
    }
    const recebido = num($('#recebido', main).value);
    if (pagamento === 'dinheiro' && recebido && recebido < t.total) return toast('Valor recebido menor que o total.', 'erro');
    const venda = registrarVenda({
      itens: t.ls.map((l) => ({ produto: l.produto, qtd: l.qtd, preco: l.preco })),
      desconto: t.desconto, pagamento, recebido: recebido || t.total
    });
    carrinho = []; salvar();
    $('#desc', main).value = ''; $('#recebido', main).value = '';
    pagamento = 'pix';
    desenhar();
    modal({
      titulo: 'Venda concluída',
      html: `<div class="center"><div style="font-size:3rem;color:var(--ok)">✔</div>
        <p>Venda <b>${esc(venda.numero)}</b></p>
        <div style="font-size:2rem;font-weight:800">${esc(brl(venda.total))}</div>
        <p class="muted">${esc(PAGAMENTOS[venda.pagamento])}${venda.troco ? ` · <b>Troco: ${esc(brl(venda.troco))}</b>` : ''}</p></div>`,
      botoes: [
        { t: 'Imprimir', acao: () => { imprimirComprovante(venda); return false; } },
        { t: 'WhatsApp', acao: () => { whatsappComprovante(venda); return false; } },
        { t: 'Nova venda', cls: 'prim' }
      ],
      onClose: foco
    });
  };

  // Permite editar o preço unitário no carrinho (somente sócios), com duplo clique no item.
  if (isSocio()) {
    elItens.ondblclick = (e) => {
      const row = e.target.closest('[data-i]');
      if (!row || e.target.closest('.qtd')) return;
      const l = linhas()[Number(row.dataset.i)];
      const c = carrinho.find((x) => x.produtoId === l.produtoId);
      const m = modal({
        titulo: 'Preço unitário nesta venda',
        html: `<label class="campo"><span>${esc(nomeProduto(l.produto))}</span><input id="np" inputmode="decimal" value="${dec(c.preco)}" autofocus></label>`,
        botoes: [{ t: 'Cancelar' }, { t: 'Aplicar', cls: 'prim', acao: ({ corpo }) => { c.preco = arred(num(corpo.querySelector('#np').value)); salvar(); desenhar(); } }]
      });
      return m;
    };
  }

  desenhar();
  foco();
  return on(['produtos'], desenhar);
}
