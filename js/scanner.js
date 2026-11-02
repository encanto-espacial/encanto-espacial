// Leitura de código de barras pela câmera (celular/tablet/notebook).
// Leitores USB/Bluetooth funcionam como teclado: basta usar os campos de código.
import { modal, bip, esc, normalizaCodigo } from './util.js';

/**
 * Abre a câmera e chama onCode(codigo) a cada leitura.
 * Em modo contínuo, onCode pode retornar {msg, ok} para mostrar o resultado.
 */
export function abrirScanner({ titulo = 'Ler código de barras', continuo = false, onCode }) {
  const idLeitor = 'leitor-' + Math.random().toString(36).slice(2);
  let leitor = null;
  let ultimo = '';
  let tUltimo = 0;

  const parar = async () => {
    try { if (leitor && leitor.isScanning) await leitor.stop(); leitor && leitor.clear(); } catch { /* já parado */ }
  };

  const m = modal({
    titulo,
    html: `<div id="${idLeitor}" class="leitor"></div>
      <div class="ultimo" data-ultimo>${continuo ? 'Leia os produtos em sequência' : 'Aponte a câmera para o código de barras'}</div>
      <form class="input-acao" data-manual>
        <input name="c" placeholder="Ou digite o código / use o leitor USB" inputmode="numeric" autocomplete="off">
        <button class="btn">OK</button>
      </form>`,
    botoes: [{ t: continuo ? 'Concluir' : 'Cancelar', cls: continuo ? 'prim' : '' }],
    onClose: parar
  });
  const elUltimo = m.corpo.querySelector('[data-ultimo]');

  const tratar = async (bruto) => {
    const codigo = normalizaCodigo(bruto);
    if (!codigo) return;
    const agora = Date.now();
    if (codigo === ultimo && agora - tUltimo < 1800) return; // evita leitura duplicada
    ultimo = codigo; tUltimo = agora;
    let r;
    try { r = await onCode(codigo); } catch (e) { r = { ok: false, msg: e.message }; }
    const ok = !(r && r.ok === false);
    bip(ok);
    if (!continuo && ok) { m.close(); return; }
    elUltimo.style.color = ok ? 'var(--ok)' : 'var(--perigo)';
    elUltimo.innerHTML = esc(r?.msg || `Lido: ${codigo}`);
  };

  m.corpo.querySelector('[data-manual]').onsubmit = (e) => {
    e.preventDefault();
    const inp = e.target.c;
    ultimo = ''; // digitação manual sempre aceita
    tratar(inp.value);
    inp.value = '';
  };

  if (!window.Html5Qrcode) {
    elUltimo.textContent = 'Leitor de câmera indisponível. Digite o código.';
    return m;
  }
  const F = window.Html5QrcodeSupportedFormats;
  leitor = new window.Html5Qrcode(idLeitor, {
    verbose: false,
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
    useBarCodeDetectorIfSupported: true,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  });
  leitor.start(
    { facingMode: 'environment' },
    {
      fps: 12,
      qrbox: (w, h) => ({ width: Math.max(120, Math.floor(Math.min(w * 0.9, 420))), height: Math.max(80, Math.floor(Math.min(h * 0.5, 200))) })
    },
    (texto) => tratar(texto),
    () => {}
  ).catch((e) => {
    console.warn(e);
    elUltimo.style.color = 'var(--perigo)';
    elUltimo.textContent = 'Não foi possível abrir a câmera. Verifique a permissão do navegador (o site precisa estar em https).';
  });
  return m;
}
