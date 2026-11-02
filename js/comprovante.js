// Comprovante de venda (não fiscal): impressão e compartilhamento por WhatsApp.
import { state, PAGAMENTOS } from './state.js';
import { esc, brl, fmtDataHora, imprimir } from './util.js';

export function imprimirComprovante(v) {
  const c = state.config;
  imprimir(`<div class="cupom">
    <h3>${esc(c.nome)}</h3>
    <div class="center">${esc(c.endereco || '')}${c.telefone ? `<br>${esc(c.telefone)}` : ''}${c.instagram ? `<br>${esc(c.instagram)}` : ''}</div>
    <div class="sep"></div>
    <div>Venda <b>${esc(v.numero)}</b><br>${esc(fmtDataHora(v.criadoEm))}<br>Vendedor: ${esc(v.vendedorNome)}</div>
    <div class="sep"></div>
    <table style="width:100%">
      ${v.itens.map((i) => `<tr><td colspan="2">${esc(i.nome)}</td></tr><tr><td>${i.qtd} x ${esc(brl(i.preco))}</td><td class="right">${esc(brl(i.qtd * i.preco))}</td></tr>`).join('')}
    </table>
    <div class="sep"></div>
    <table style="width:100%">
      <tr><td>Subtotal</td><td class="right">${esc(brl(v.subtotal))}</td></tr>
      ${v.desconto ? `<tr><td>Desconto</td><td class="right">-${esc(brl(v.desconto))}</td></tr>` : ''}
      <tr><td><b>TOTAL</b></td><td class="right"><b>${esc(brl(v.total))}</b></td></tr>
      <tr><td>${esc(PAGAMENTOS[v.pagamento] || v.pagamento)}</td><td class="right">${esc(brl(v.recebido))}</td></tr>
      ${v.troco ? `<tr><td>Troco</td><td class="right">${esc(brl(v.troco))}</td></tr>` : ''}
    </table>
    <div class="sep"></div>
    <div class="center">${esc(c.mensagemCupom || '')}<br><small>Documento sem valor fiscal</small></div>
  </div>`, '@page { size: 80mm auto; margin: 3mm; }');
}

export function textoComprovante(v) {
  const c = state.config;
  return [
    `*${c.nome}*`,
    `Venda ${v.numero} – ${fmtDataHora(v.criadoEm)}`,
    '',
    ...v.itens.map((i) => `${i.qtd}x ${i.nome} – ${brl(i.qtd * i.preco)}`),
    '',
    v.desconto ? `Desconto: -${brl(v.desconto)}` : null,
    `*Total: ${brl(v.total)}* (${PAGAMENTOS[v.pagamento] || v.pagamento})`,
    '',
    c.mensagemCupom || ''
  ].filter((x) => x !== null).join('\n');
}

export function whatsappComprovante(v) {
  window.open(`https://wa.me/?text=${encodeURIComponent(textoComprovante(v))}`, '_blank');
}
