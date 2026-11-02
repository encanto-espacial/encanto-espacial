// Histórico de vendas do dia (ou período), detalhes, reimpressão e cancelamento (sócio).
import { isSocio, cancelarVenda, PAGAMENTOS } from '../state.js';
import { $, esc, brl, fmtHora, fmtDataHora, diaISO, deISO, inicioDia, fimDia, modal, toast, pedirTexto } from '../util.js';
import { assinarVendas, resumo } from '../calc.js';
import { imprimirComprovante, whatsappComprovante } from '../comprovante.js';

export function render(main) {
  const socio = isSocio();
  let dia = diaISO();
  let vendas = [];
  let unsub = null;
  let filtroPag = '';

  main.innerHTML = `
    <div class="card"><div class="barra">
      <label class="campo"><span>Dia</span><input type="date" id="vDia" value="${dia}"></label>
      <label class="campo"><span>Pagamento</span><select id="vPag"><option value="">Todos</option>${Object.entries(PAGAMENTOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      ${socio ? '' : '<span class="muted small" style="padding-bottom:10px">Você vê apenas as suas vendas.</span>'}
    </div></div>
    <div class="kpis" id="vKpis"></div>
    <div class="card" style="padding:0"><div id="vLista"></div></div>`;

  const assinar = () => {
    unsub && unsub();
    const d = deISO(dia);
    unsub = assinarVendas(inicioDia(d), fimDia(d), (arr) => { vendas = arr.sort((a, b) => b.criadoEm - a.criadoEm); desenhar(); }, { somenteMinhas: !socio });
  };

  const desenhar = () => {
    const lista = vendas.filter((v) => !filtroPag || v.pagamento === filtroPag);
    const r = resumo(lista);
    const porPag = Object.keys(PAGAMENTOS).map((k) => [k, lista.filter((v) => v.status !== 'cancelada' && v.pagamento === k).reduce((s, v) => s + v.total, 0)]);
    $('#vKpis', main).innerHTML = `
      <div class="kpi"><div class="t">Faturamento</div><div class="v">${esc(brl(r.faturamento))}</div><div class="d">${r.vendas} venda(s)${r.canceladas ? ` · ${r.canceladas} cancelada(s)` : ''}</div></div>
      <div class="kpi roxo"><div class="t">Ticket médio</div><div class="v">${esc(brl(r.ticket))}</div><div class="d">${r.itens} item(ns)</div></div>
      ${porPag.map(([k, v]) => `<div class="kpi"><div class="t">${PAGAMENTOS[k]}</div><div class="v">${esc(brl(v))}</div></div>`).join('')}`;
    $('#vLista', main).innerHTML = lista.length ? `<div class="tabela-wrap"><table>
      <thead><tr><th>Hora</th><th>Venda</th><th>Itens</th><th>Pagamento</th><th>Vendedor</th><th class="num">Total</th></tr></thead>
      <tbody>${lista.map((v) => `<tr class="clicavel ${v.status === 'cancelada' ? 'cancelada' : ''}" data-id="${v.id}">
        <td>${esc(fmtHora(v.criadoEm))}</td><td class="mono">${esc(v.numero)}</td>
        <td>${esc(v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(', ')).slice(0, 90)}</td>
        <td>${esc(PAGAMENTOS[v.pagamento] || v.pagamento)}</td><td>${esc(v.vendedorNome)}</td>
        <td class="num"><b>${esc(brl(v.total))}</b></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="vazio">Nenhuma venda neste dia.</div>';
  };

  $('#vDia', main).onchange = (e) => { dia = e.target.value || diaISO(); assinar(); };
  $('#vPag', main).onchange = (e) => { filtroPag = e.target.value; desenhar(); };
  $('#vLista', main).onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) detalheVenda(vendas.find((v) => v.id === tr.dataset.id));
  };

  assinar();
  return () => unsub && unsub();
}

export function detalheVenda(v) {
  if (!v) return;
  const cancelada = v.status === 'cancelada';
  modal({
    titulo: `Venda ${v.numero}`,
    html: `<p class="muted" style="margin-top:0">${esc(fmtDataHora(v.criadoEm))} · ${esc(v.vendedorNome)} · ${esc(PAGAMENTOS[v.pagamento] || v.pagamento)}
      ${cancelada ? `<br><span class="tag perigo">Cancelada</span> por ${esc(v.canceladaPor || '')} em ${esc(fmtDataHora(v.canceladaEm))}: ${esc(v.motivoCancelamento || '')}` : ''}</p>
      <div class="tabela-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Preço</th><th class="num">Total</th></tr></thead><tbody>
      ${v.itens.map((i) => `<tr><td>${esc(i.nome)}<br><span class="small muted mono">${esc(i.codigo)}</span></td><td class="num">${i.qtd}</td><td class="num">${esc(brl(i.preco))}</td><td class="num">${esc(brl(i.qtd * i.preco))}</td></tr>`).join('')}
      </tbody><tfoot>
        <tr><td colspan="3">Subtotal</td><td class="num">${esc(brl(v.subtotal))}</td></tr>
        ${v.desconto ? `<tr><td colspan="3">Desconto</td><td class="num">-${esc(brl(v.desconto))}</td></tr>` : ''}
        <tr><td colspan="3">Total</td><td class="num">${esc(brl(v.total))}</td></tr>
        ${v.troco ? `<tr><td colspan="3">Recebido / troco</td><td class="num">${esc(brl(v.recebido))} / ${esc(brl(v.troco))}</td></tr>` : ''}
      </tfoot></table></div>`,
    botoes: [
      ...(isSocio() && !cancelada ? [{
        t: 'Cancelar venda', cls: 'perigo', acao: async () => {
          const motivo = await pedirTexto('Cancelar venda', 'Motivo do cancelamento (os itens voltam ao estoque)');
          if (motivo === null) return false;
          cancelarVenda(v, motivo || 'Não informado');
          toast('Venda cancelada e estoque devolvido.', 'ok');
        }
      }] : []),
      { t: 'WhatsApp', acao: () => { whatsappComprovante(v); return false; } },
      { t: 'Imprimir', acao: () => { imprimirComprovante(v); return false; } },
      { t: 'Fechar', cls: 'prim' }
    ]
  });
}
