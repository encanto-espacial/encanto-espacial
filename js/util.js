// Utilitários gerais: formatação, datas, código de barras, modal e avisos.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export const brl = (v) => fmtBRL.format(Number(v) || 0);
export const n2 = (v) => fmtNum.format(Number(v) || 0);
export const pct = (v) => `${fmtNum.format((Number(v) || 0) * 100)}%`;

/** Converte "1.234,56", "12,5" ou "12.5" em número. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
export const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;
export const dec = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');

// ---------- Datas ----------
const pad = (n) => String(n).padStart(2, '0');
export const diaISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deISO = (s) => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
export const inicioDia = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const fimDia = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmtData = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR') : '');
export const fmtDataHora = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const fmtHora = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDiaCurto = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

// ---------- IDs ----------
export function novoId(tam = 20) {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const r = crypto.getRandomValues(new Uint8Array(tam));
  return Array.from(r, (b) => c[b % c.length]).join('');
}
export function numeroVenda(d = new Date()) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(4));
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Array.from(r, (b) => c[b % c.length]).join('')}`;
}

// ---------- Código de barras (EAN-13) ----------
export function digitoEAN(doze) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(doze[i]) * (i % 2 ? 3 : 1);
  return String((10 - (s % 10)) % 10);
}
export const eanValido = (c) => /^\d{13}$/.test(c) && digitoEAN(c.slice(0, 12)) === c[12];
/** Gera EAN-13 de uso interno (prefixo 20–29 é reservado para uso da loja). */
export function gerarEAN(existentes = new Set()) {
  for (;;) {
    const r = crypto.getRandomValues(new Uint32Array(2));
    const corpo = '2' + String(r[0] % 10) + String(r[1]).padStart(10, '0').slice(-10);
    const ean = corpo + digitoEAN(corpo);
    if (!existentes.has(ean)) return ean;
  }
}
export const normalizaCodigo = (c) => String(c ?? '').trim().replace(/\s+/g, '');

// ---------- Texto ----------
export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const casaBusca = (texto, termo) => {
  const t = semAcento(texto);
  return semAcento(termo).split(/\s+/).filter(Boolean).every((p) => t.includes(p));
};
export const listaCSV = (s) => String(s ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

// ---------- Avisos ----------
export function toast(msg, tipo = '', ms = 3200) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

let audioCtx;
export function bip(ok = true) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = ok ? 1250 : 300;
    g.gain.value = 0.12;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (ok ? 0.09 : 0.3));
  } catch { /* sem áudio */ }
  if (navigator.vibrate) navigator.vibrate(ok ? 40 : [80, 50, 80]);
}

// ---------- Modal ----------
/**
 * Abre um modal. botoes: [{t:'Salvar', cls:'prim', acao: async (m) => false para manter aberto}]
 */
export function modal({ titulo, html = '', botoes = [{ t: 'Fechar' }], largo = false, onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
    <header><h3>${esc(titulo)}</h3><button class="x" type="button" aria-label="Fechar">×</button></header>
    <div class="modal-corpo">${html}</div><footer></footer></div>`;
  const el = bg.querySelector('.modal');
  const corpo = bg.querySelector('.modal-corpo');
  const rodape = bg.querySelector('footer');
  let fechado = false;
  const close = () => {
    if (fechado) return;
    fechado = true;
    document.removeEventListener('keydown', onKey);
    bg.remove();
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && bg === $$('.modal-bg').pop()) close(); };
  document.addEventListener('keydown', onKey);
  bg.querySelector('.x').onclick = close;
  for (const b of botoes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${b.cls || ''}`;
    btn.textContent = b.t;
    btn.onclick = async () => {
      if (!b.acao) return close();
      btn.disabled = true;
      try {
        const r = await b.acao({ el, corpo, close });
        if (r !== false) close();
      } catch (e) {
        console.error(e);
        toast(e.message || 'Erro', 'erro');
      } finally { btn.disabled = false; }
    };
    rodape.appendChild(btn);
  }
  document.body.appendChild(bg);
  const foco = corpo.querySelector('[autofocus]');
  if (foco) setTimeout(() => foco.focus(), 50);
  return { el, corpo, close };
}

export function confirmar(msg, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((res) => {
    let r = false;
    modal({
      titulo,
      html: `<p>${esc(msg)}</p>`,
      botoes: [{ t: 'Cancelar' }, { t: ok, cls: perigo ? 'perigo' : 'prim', acao: () => { r = true; } }],
      onClose: () => res(r)
    });
  });
}

export function pedirTexto(titulo, rotulo, valor = '') {
  return new Promise((res) => {
    let r = null;
    modal({
      titulo,
      html: `<label class="campo"><span>${esc(rotulo)}</span><input id="pt" value="${esc(valor)}" autofocus></label>`,
      botoes: [{ t: 'Cancelar' }, { t: 'OK', cls: 'prim', acao: ({ corpo }) => { r = corpo.querySelector('#pt').value.trim(); } }],
      onClose: () => res(r)
    });
  });
}

/** Lê os campos nomeados de um formulário/elemento. */
export function lerForm(el) {
  const o = {};
  for (const f of $$('[name]', el)) {
    if (f.type === 'checkbox') o[f.name] = f.checked;
    else if (f.type === 'radio') { if (f.checked) o[f.name] = f.value; }
    else o[f.name] = f.value.trim();
  }
  return o;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Imprime o HTML informado usando a área de impressão (com @page opcional). */
export function imprimir(html, pageCss = '@page { margin: 8mm; }') {
  const area = document.getElementById('printArea');
  let st = document.getElementById('pageStyle');
  if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
  st.textContent = pageCss;
  area.innerHTML = html;
  document.body.classList.add('imprimindo');
  const fim = () => { document.body.classList.remove('imprimindo'); area.innerHTML = ''; window.removeEventListener('afterprint', fim); };
  window.addEventListener('afterprint', fim);
  // Só o CSS de impressão usa a classe/área, então não há problema se "afterprint" não disparar.
  setTimeout(() => window.print(), 150);
}
