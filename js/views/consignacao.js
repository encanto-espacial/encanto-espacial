// Consignação: cadastro de consignantes (artesãos/parceiros), acerto de contas e histórico.
import { state, store, on, nomeProduto, custoDe, consignanteNome, nomeUsuario, registrarLog } from '../state.js';
import { $, $$, esc, brl, toast, modal, lerForm, diaISO, deISO, inicioDia, fimDia, fmtData, somaDias, num, arred, dec } from '../util.js';
import { buscarVendas, itensVendidos, agrupar } from '../calc.js';
import { exportarPDF, exportarXLSX, tabelaHTML } from '../exportar.js';
import { ic } from '../icones.js';

export function render(main) {
  let aba = 'consignantes';
  let acertos = [];
  main.innerHTML = `<div class="abas" id="cAbas"><button data-a="consignantes">Consignantes</button><button data-a="acerto">Acerto de contas</button><button data-a="historico">Histórico de acertos</button></div><div id="cCorpo"></div>`;
  const corpo = $('#cCorpo', main);
  const unsubAc = store.subscribe('acertos', {}, (arr) => { acertos = arr.sort((a, b) => b.criadoEm - a.criadoEm); if (aba !== 'acerto') abrir(aba); });

  function abrir(a) {
    aba = a;
    $$('#cAbas button', main).forEach((b) => b.classList.toggle('ativo', b.dataset.a === a));
    if (a === 'consignantes') listaConsignantes(corpo);
    else if (a === 'acerto') telaAcerto(corpo, acertos);
    else historico(corpo, acertos);
  }
  $('#cAbas', main).onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) abrir(b.dataset.a); };
  abrir(aba);
  const off = on(['consignantes', 'produtos', 'custos'], () => aba === 'consignantes' && abrir(aba));
  return () => { unsubAc(); off(); };
}

function listaConsignantes(el) {
  const dados = state.consignantes.map((c) => {
    const ps = state.produtos.filter((p) => p.consignanteId === c.id && p.ativo !== false);
    const un = ps.reduce((s, p) => s + Math.max(0, Number(p.estoque) || 0), 0);
    const val = ps.reduce((s, p) => s + Math.max(0, Number(p.estoque) || 0) * custoDe(p.id), 0);
    return { c, n: ps.length, un, val };
  });
  el.innerHTML = `<div class="card"><div class="acoes"><button class="btn prim" data-novo>${ic('mais')} Novo consignante</button>
    <span class="muted small">Artesãos e parceiros que deixam produtos na loja e recebem pelo que for vendido.</span></div></div>
    <div class="card" style="padding:0">${dados.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Contato</th><th class="num">Produtos</th><th class="num">Unid. na loja</th><th class="num">Valor a repassar se vender tudo</th></tr></thead><tbody>
      ${dados.map((d) => `<tr class="clicavel ${d.c.ativo === false ? 'cancelada' : ''}" data-id="${d.c.id}"><td><b>${esc(d.c.nome)}</b></td><td>${esc(d.c.telefone || '')}${d.c.pix ? `<br><span class="small muted">Pix: ${esc(d.c.pix)}</span>` : ''}</td>
        <td class="num">${d.n}</td><td class="num">${d.un}</td><td class="num">${esc(brl(d.val))}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum consignante cadastrado.</div>'}</div>`;
  $('[data-novo]', el).onclick = () => formConsignante();
  el.querySelector('tbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('[data-id]');
    if (tr) formConsignante(state.consignantes.find((c) => c.id === tr.dataset.id));
  });
}

export function formConsignante(c = {}) {
  modal({
    titulo: c.id ? 'Editar consignante' : 'Novo consignante',
    html: `<div class="form">
      <label class="campo full"><span>Nome *</span><input name="nome" value="${esc(c.nome || '')}" autofocus></label>
      <label class="campo"><span>Telefone / WhatsApp</span><input name="telefone" value="${esc(c.telefone || '')}" inputmode="tel"></label>
      <label class="campo"><span>Chave Pix</span><input name="pix" value="${esc(c.pix || '')}"></label>
      <label class="campo"><span>CPF / CNPJ</span><input name="documento" value="${esc(c.documento || '')}"></label>
      <label class="campo"><span>Cidade / comunidade</span><input name="cidade" value="${esc(c.cidade || '')}"></label>
      <label class="campo full"><span>Observações (acordo, prazo de acerto…)</span><textarea name="obs">${esc(c.obs || '')}</textarea></label>
      <label class="check full"><input type="checkbox" name="ativo" ${c.ativo !== false ? 'checked' : ''}> Ativo</label>
    </div>`,
    botoes: [{ t: 'Cancelar' }, {
      t: 'Salvar', cls: 'prim', acao: ({ corpo }) => {
        const f = lerForm(corpo);
        if (!f.nome) { toast('Informe o nome.', 'erro'); return false; }
        const id = c.id || store.newId();
        store.commit([{ op: 'set', col: 'consignantes', id, data: { ...f, criadoEm: c.criadoEm || Date.now(), atualizadoEm: Date.now() }, merge: true }]);
        registrarLog('consignante', `${c.id ? 'Alterou' : 'Cadastrou'} o consignante ${f.nome}${f.ativo ? '' : ' (inativo)'}`, { consignanteId: id });
        toast('Consignante salvo.', 'ok');
      }
    }]
  });
}

function telaAcerto(el, acertos) {
  const ativos = state.consignantes;
  el.innerHTML = `<div class="card"><div class="barra">
      <label class="campo cresce"><span>Consignante</span><select data-c><option value="">Selecione…</option>${ativos.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo"><span>De</span><input type="date" data-de value="${diaISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}"></label>
      <label class="campo"><span>Até</span><input type="date" data-ate value="${diaISO()}"></label>
      <button class="btn prim" data-calc>Calcular</button>
    </div><p class="dica" data-ult></p></div><div data-res></div>`;
  const sel = $('[data-c]', el);
  sel.onchange = () => {
    const ult = acertos.find((a) => a.consignanteId === sel.value);
    $('[data-ult]', el).textContent = ult ? `Último acerto: ${fmtData(deISO(ult.de).getTime())} a ${fmtData(deISO(ult.ate).getTime())} – ${brl(ult.valor)} (pago em ${fmtData(ult.criadoEm)}).` : 'Nenhum acerto anterior.';
    if (ult) $('[data-de]', el).value = diaISO(somaDias(deISO(ult.ate), 1));
  };
  $('[data-calc]', el).onclick = async () => {
    const cid = sel.value;
    if (!cid) return toast('Selecione o consignante.', 'alerta');
    const deS = $('[data-de]', el).value, ateS = $('[data-ate]', el).value;
    const vendas = await buscarVendas(inicioDia(deISO(deS)), fimDia(deISO(ateS)));
    const itens = itensVendidos(vendas).filter((i) => i.consignanteId === cid);
    const grupos = agrupar(itens, (i) => i.produtoId).map((g) => {
      const it = itens.find((i) => i.produtoId === g.chave);
      const p = state.porId.get(g.chave);
      return { produto: p ? nomeProduto(p) : it.nome, codigo: it.codigo, qtd: g.qtd, vendido: g.receita, repasseUn: custoDe(g.chave), repasse: g.custo };
    }).sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));
    const nome = consignanteNome(cid);
    const tot = { qtd: grupos.reduce((s, g) => s + g.qtd, 0), vendido: grupos.reduce((s, g) => s + g.vendido, 0), repasse: grupos.reduce((s, g) => s + g.repasse, 0) };
    const rel = {
      titulo: `Acerto de consignação – ${nome}`,
      subtitulo: `Período: ${fmtData(deISO(deS).getTime())} a ${fmtData(deISO(ateS).getTime())}`,
      resumo: [{ t: 'Unidades vendidas', v: tot.qtd }, { t: 'Valor a repassar', v: brl(tot.repasse) }],
      colunas: [{ k: 'produto', t: 'Produto' }, { k: 'codigo', t: 'Código' }, { k: 'qtd', t: 'Qtd', tipo: 'int' }, { k: 'repasseUn', t: 'Repasse unit.', tipo: 'brl' }, { k: 'repasse', t: 'Total repasse', tipo: 'brl' }],
      linhas: grupos,
      totais: { qtd: tot.qtd, repasse: tot.repasse }
    };
    const naLoja = state.produtos.filter((p) => p.consignanteId === cid && (Number(p.estoque) || 0) > 0);
    $('[data-res]', el).innerHTML = `<div class="kpis">
        <div class="kpi"><div class="t">Unidades vendidas</div><div class="v">${tot.qtd}</div></div>
        <div class="kpi"><div class="t">Total vendido (líquido)</div><div class="v">${esc(brl(tot.vendido))}</div></div>
        <div class="kpi roxo"><div class="t">A repassar</div><div class="v">${esc(brl(tot.repasse))}</div></div>
        <div class="kpi"><div class="t">Ganho da loja</div><div class="v">${esc(brl(tot.vendido - tot.repasse))}</div></div></div>
      <div class="card"><div class="acoes" style="margin-bottom:10px"><h3 style="margin:0">Itens vendidos</h3><span class="espaco"></span>
        <button class="btn peq" data-pdf>${ic('baixar')} PDF</button><button class="btn peq" data-xlsx>${ic('baixar')} Excel</button>
        <button class="btn peq" data-wa>${ic('whats')} WhatsApp</button><button class="btn peq prim" data-pagar>Registrar pagamento</button></div>
        ${tabelaHTML(rel)}</div>
      <div class="card"><h3>Ainda na loja (${naLoja.reduce((s, p) => s + Number(p.estoque), 0)} un.)</h3>
        ${naLoja.length ? naLoja.map((p) => `<div class="lista-item"><div class="info"><b>${esc(nomeProduto(p))}</b><span class="small muted mono">${esc(p.codigo || '')}</span></div><span class="tag">${Number(p.estoque)} un.</span></div>`).join('') : '<div class="vazio">Nenhum item em estoque.</div>'}</div>`;
    $('[data-pdf]', el).onclick = () => exportarPDF(rel);
    $('[data-xlsx]', el).onclick = () => exportarXLSX(rel);
    $('[data-wa]', el).onclick = () => {
      const c = state.consignantes.find((x) => x.id === cid);
      const txt = [`*${state.config.nome} – Acerto de consignação*`, `${nome}`, rel.subtitulo, '',
        ...grupos.map((g) => `${g.qtd}x ${g.produto} – ${brl(g.repasse)}`), '', `*Total a receber: ${brl(tot.repasse)}*`].join('\n');
      const tel = String(c?.telefone || '').replace(/\D/g, '');
      window.open(`https://wa.me/${tel ? (tel.length <= 11 ? '55' + tel : tel) : ''}?text=${encodeURIComponent(txt)}`, '_blank');
    };
    $('[data-pagar]', el).onclick = () => modal({
      titulo: 'Registrar pagamento do acerto',
      html: `<div class="form">
        <label class="campo"><span>Valor pago (R$)</span><input name="valor" inputmode="decimal" value="${dec(tot.repasse)}"></label>
        <label class="campo"><span>Forma</span><select name="forma"><option>Pix</option><option>Dinheiro</option><option>Transferência</option><option>Outro</option></select></label>
        <label class="campo full"><span>Observação</span><input name="obs"></label></div>`,
      botoes: [{ t: 'Cancelar' }, {
        t: 'Registrar', cls: 'prim', acao: ({ corpo }) => {
          const f = lerForm(corpo);
          store.commit([{ op: 'set', col: 'acertos', id: store.newId(), data: {
            consignanteId: cid, consignanteNome: nome, de: deS, ate: ateS, qtd: tot.qtd, vendido: arred(tot.vendido),
            calculado: arred(tot.repasse), valor: arred(num(f.valor)), forma: f.forma, obs: f.obs,
            itens: grupos.map((g) => ({ produto: g.produto, qtd: g.qtd, repasse: arred(g.repasse) })),
            criadoEm: Date.now(), usuarioNome: nomeUsuario()
          } }]);
          registrarLog('acerto', `Registrou pagamento de ${brl(num(f.valor))} (${f.forma}) a ${nome} – período ${fmtData(deISO(deS).getTime())} a ${fmtData(deISO(ateS).getTime())}, ${tot.qtd} un. vendidas (calculado ${brl(tot.repasse)})`,
            { consignanteId: cid, valor: arred(num(f.valor)), calculado: arred(tot.repasse), forma: f.forma, obs: f.obs });
          toast('Acerto registrado.', 'ok');
        }
      }]
    });
  };
}

function historico(el, acertos) {
  el.innerHTML = `<div class="card" style="padding:0">${acertos.length ? `<div class="tabela-wrap"><table><thead><tr><th>Pago em</th><th>Consignante</th><th>Período</th><th class="num">Qtd</th><th class="num">Valor pago</th><th>Forma</th><th>Por</th></tr></thead><tbody>
    ${acertos.map((a) => `<tr><td>${esc(fmtData(a.criadoEm))}</td><td>${esc(a.consignanteNome)}</td><td>${esc(fmtData(deISO(a.de).getTime()))} a ${esc(fmtData(deISO(a.ate).getTime()))}</td>
      <td class="num">${a.qtd}</td><td class="num">${esc(brl(a.valor))}</td><td>${esc(a.forma || '')}</td><td>${esc(a.usuarioNome || '')}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum acerto registrado.</div>'}</div>`;
}
