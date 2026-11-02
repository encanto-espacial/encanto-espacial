// Cadastro de produtos: variações (tamanho/cor/tipo), custo, preço, margem, código de barras e importação.
import {
  state, store, on, isSocio, nomeProduto, variante, custoDe, codigosExistentes, consignanteNome,
  estoqueBaixo, opsMovimento, produtoPorCodigo
} from '../state.js';
import {
  $, $$, esc, brl, pct, num, arred, dec, toast, modal, confirmar, casaBusca, debounce, gerarEAN,
  normalizaCodigo, listaCSV, lerForm, semAcento, eanValido
} from '../util.js';
import { ic } from '../icones.js';
import { abrirScanner } from '../scanner.js';
import { enviarParaEtiquetas } from './etiquetas.js';

const LIMITE = 150;

export function render(main) {
  const socio = isSocio();
  let filtro = { busca: '', categoria: '', situacao: '' };
  let mostrar = LIMITE;

  main.innerHTML = `
    <div class="card">
      <div class="barra">
        <label class="campo cresce"><span>Buscar</span>
          <span class="input-acao"><input id="fBusca" placeholder="Nome, categoria, cor, tamanho ou código">
          <button class="btn icone escuro" id="btnScan" title="Buscar pela câmera">${ic('camera')}</button></span></label>
        <label class="campo"><span>Categoria</span><select id="fCat"></select></label>
        <label class="campo"><span>Situação</span><select id="fSit">
          <option value="">Ativos</option><option value="baixo">Estoque baixo</option><option value="zerado">Sem estoque</option>
          <option value="consignado">Consignados</option><option value="proprio">Próprios</option><option value="inativo">Inativos</option><option value="todos">Todos</option>
        </select></label>
      </div>
      <div class="acoes">
        ${socio ? `<button class="btn prim" id="btnNovo">${ic('mais')} Novo produto</button>
        <button class="btn" id="btnImportar">${ic('subir')} Importar planilha</button>
        <button class="btn" id="btnExportar">${ic('baixar')} Exportar</button>` : ''}
        <span class="espaco"></span><span class="muted small" id="contagem"></span>
      </div>
    </div>
    <div class="card" style="padding:0"><div id="lista"></div></div>`;

  const elLista = $('#lista', main);

  function preencherCategorias() {
    const cats = [...new Set([...state.config.categorias, ...state.produtos.map((p) => p.categoria).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('#fCat', main).innerHTML = `<option value="">Todas</option>${cats.map((c) => `<option ${c === filtro.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
  }

  function filtrados() {
    return state.produtos.filter((p) => {
      const ativo = p.ativo !== false;
      switch (filtro.situacao) {
        case '': if (!ativo) return false; break;
        case 'baixo': if (!ativo || !estoqueBaixo(p)) return false; break;
        case 'zerado': if (!ativo || (Number(p.estoque) || 0) > 0) return false; break;
        case 'consignado': if (!ativo || !p.consignanteId) return false; break;
        case 'proprio': if (!ativo || p.consignanteId) return false; break;
        case 'inativo': if (ativo) return false; break;
        default: break;
      }
      if (filtro.categoria && p.categoria !== filtro.categoria) return false;
      if (filtro.busca && !(p.codigo === filtro.busca || casaBusca(`${nomeProduto(p)} ${p.categoria || ''} ${p.codigo || ''} ${consignanteNome(p.consignanteId)}`, filtro.busca))) return false;
      return true;
    });
  }

  function desenhar() {
    const arr = filtrados();
    const totalEst = arr.reduce((s, p) => s + (Number(p.estoque) || 0), 0);
    $('#contagem', main).textContent = `${arr.length} item(ns) · ${totalEst} unidades`;
    if (!arr.length) {
      elLista.innerHTML = `<div class="vazio">${state.produtos.length ? 'Nenhum produto com esses filtros.' : 'Nenhum produto cadastrado ainda.'}</div>`;
      return;
    }
    elLista.innerHTML = `<div class="tabela-wrap"><table>
      <thead><tr><th>Produto</th><th class="opc">Categoria</th><th class="num">Preço</th>${socio ? '<th class="num opc">Custo</th><th class="num">Margem</th>' : ''}<th class="num">Estoque</th></tr></thead>
      <tbody>${arr.slice(0, mostrar).map((p) => {
        const est = Number(p.estoque) || 0;
        const c = custoDe(p.id);
        const marg = p.preco ? (p.preco - c) / p.preco : 0;
        const tag = p.ativo === false ? 'tag' : est <= 0 ? 'tag perigo' : estoqueBaixo(p) ? 'tag alerta' : 'tag ok';
        return `<tr class="clicavel" data-id="${p.id}">
          <td><b>${esc(p.nome)}</b>${variante(p) ? `<br><span class="small">${esc(variante(p))}</span>` : ''}
            <br><span class="small muted mono">${esc(p.codigo || 'sem código')}</span>
            ${p.consignanteId ? ` <span class="tag roxo">${esc(consignanteNome(p.consignanteId) || 'consignado')}</span>` : ''}
            ${p.ativo === false ? ' <span class="tag">inativo</span>' : ''}</td>
          <td class="opc">${esc(p.categoria || '')}</td>
          <td class="num">${esc(brl(p.preco))}</td>
          ${socio ? `<td class="num opc">${esc(brl(c))}</td><td class="num">${p.preco ? esc(pct(marg)) : '–'}</td>` : ''}
          <td class="num"><span class="${tag}">${est}</span></td></tr>`;
      }).join('')}</tbody></table></div>
      ${arr.length > mostrar ? `<div class="center" style="padding:12px"><button class="btn" id="btnMais">Mostrar mais (${arr.length - mostrar})</button></div>` : ''}`;
    const bm = $('#btnMais', elLista);
    if (bm) bm.onclick = () => { mostrar += LIMITE; desenhar(); };
  }

  $('#fBusca', main).oninput = debounce((e) => { filtro.busca = e.target.value.trim(); mostrar = LIMITE; desenhar(); }, 150);
  $('#fCat', main).onchange = (e) => { filtro.categoria = e.target.value; desenhar(); };
  $('#fSit', main).onchange = (e) => { filtro.situacao = e.target.value; desenhar(); };
  $('#btnScan', main).onclick = () => abrirScanner({
    onCode: (c) => {
      const p = produtoPorCodigo(c);
      if (p) { abrirProduto(p); return { ok: true }; }
      if (socio) { formProduto({ codigo: c }); return { ok: true }; }
      toast(`Código ${c} não cadastrado.`, 'erro');
      return { ok: false, msg: `Código ${c} não cadastrado` };
    }
  });
  elLista.onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) abrirProduto(state.porId.get(tr.dataset.id));
  };
  if (socio) {
    $('#btnNovo', main).onclick = () => formProduto();
    $('#btnImportar', main).onclick = importarPlanilha;
    $('#btnExportar', main).onclick = exportarProdutos;
  }

  preencherCategorias();
  desenhar();
  return on(['produtos', 'custos', 'consignantes', 'config'], () => { preencherCategorias(); desenhar(); });
}

function abrirProduto(p) {
  if (!p) return;
  if (isSocio()) return formProduto(p);
  modal({
    titulo: nomeProduto(p),
    html: `<table><tbody>
      <tr><th>Código</th><td class="mono">${esc(p.codigo || '')}</td></tr>
      <tr><th>Categoria</th><td>${esc(p.categoria || '')}</td></tr>
      <tr><th>Preço</th><td><b>${esc(brl(p.preco))}</b></td></tr>
      <tr><th>Estoque</th><td>${Number(p.estoque) || 0}</td></tr>
      ${p.descricao ? `<tr><th>Descrição</th><td>${esc(p.descricao)}</td></tr>` : ''}
    </tbody></table>`,
    botoes: [{ t: 'Etiquetas', acao: () => enviarParaEtiquetas([{ produtoId: p.id, qtd: 1 }]) }, { t: 'Fechar', cls: 'prim' }]
  });
}

// =====================================================================
//  Formulário de produto (novo, com grade de variações, ou edição)
// =====================================================================
export function formProduto(p = {}) {
  const editando = !!p.id;
  const cfg = state.config;
  const cats = [...new Set([...cfg.categorias, ...state.produtos.map((x) => x.categoria).filter(Boolean)])];
  const custo = editando ? custoDe(p.id) : (p.custo ?? '');
  let modo = 'unico';
  let grade = [];

  const m = modal({
    titulo: editando ? 'Editar produto' : 'Novo produto',
    largo: true,
    html: `
      ${editando ? '' : `<div class="abas" id="abasModo"><button type="button" data-m="unico" class="ativo">Produto único</button><button type="button" data-m="grade">Com variações (tamanho / cor / tipo)</button></div>`}
      <div class="form" id="fp">
        <label class="campo full"><span>Nome do produto *</span><input name="nome" value="${esc(p.nome || '')}" placeholder="Ex.: Camiseta Disco Voador" autofocus></label>
        <label class="campo"><span>Categoria</span><input name="categoria" list="dlCat" value="${esc(p.categoria || '')}"><datalist id="dlCat">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="campo"><span>Estoque mínimo (alerta)</span><input name="estoqueMin" inputmode="numeric" value="${esc(p.estoqueMin ?? 2)}"></label>
        <label class="campo"><span>Preço de custo / repasse (R$)</span><input name="custo" inputmode="decimal" value="${custo === '' ? '' : dec(custo)}" placeholder="0,00"></label>
        <label class="campo"><span>Preço de venda (R$) *</span><input name="preco" inputmode="decimal" value="${p.preco !== undefined ? dec(p.preco) : ''}" placeholder="0,00"></label>
        <div class="full small" id="margem"></div>
        <div class="full acoes">
          <label class="check"><input type="radio" name="origem" value="proprio" ${!p.consignanteId ? 'checked' : ''}> Produto próprio</label>
          <label class="check"><input type="radio" name="origem" value="consignado" ${p.consignanteId ? 'checked' : ''}> Consignado (de artesão/parceiro)</label>
        </div>
        <label class="campo full ${p.consignanteId ? '' : 'hidden'}" id="boxCons"><span>Consignante</span>
          <select name="consignanteId"><option value="">Selecione…</option>${state.consignantes.filter((c) => c.ativo !== false || c.id === p.consignanteId).map((c) => `<option value="${c.id}" ${c.id === p.consignanteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
          <span class="dica">Para consignados, o "preço de custo" é o valor a repassar ao consignante por unidade vendida. Cadastre consignantes em <b>Consignação</b>.</span></label>
        <label class="campo full"><span>Descrição</span><textarea name="descricao" rows="2">${esc(p.descricao || '')}</textarea></label>
      </div>
      <div id="boxUnico" style="margin-top:12px">
        <div class="form">
          <label class="campo full"><span>Código de barras</span>
            <span class="input-acao"><input name="codigo" class="mono" value="${esc(p.codigo || '')}" placeholder="Leia, digite ou gere">
            <button type="button" class="btn icone" data-cam title="Ler com a câmera">${ic('camera')}</button>
            <button type="button" class="btn" data-gerar>Gerar</button></span>
            <span class="dica">Produto sem código? Clique em <b>Gerar</b> e imprima a etiqueta.</span></label>
          <label class="campo"><span>Tipo / modelo</span><input name="tipo" value="${esc(p.tipo || '')}" placeholder="Ex.: Baby look, Infantil"></label>
          <label class="campo"><span>Cor</span><input name="cor" value="${esc(p.cor || '')}"></label>
          <label class="campo"><span>Tamanho</span><input name="tamanho" value="${esc(p.tamanho || '')}" list="dlTam"><datalist id="dlTam">${cfg.tamanhos.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
          <label class="campo"><span>${editando ? 'Estoque atual' : 'Estoque inicial'}</span><input name="estoque" inputmode="numeric" value="${editando ? Number(p.estoque) || 0 : 0}">
            ${editando ? '<span class="dica">Alterar aqui registra um ajuste de estoque.</span>' : ''}</label>
        </div>
      </div>
      <div id="boxGrade" class="hidden" style="margin-top:12px">
        <div class="form">
          <label class="campo full"><span>Tipos / modelos (separe por vírgula)</span><input data-g="tipos" placeholder="Ex.: Tradicional, Baby look, Infantil"></label>
          <label class="campo full"><span>Cores (separe por vírgula)</span><input data-g="cores" placeholder="Ex.: Preta, Branca, Azul"></label>
          <label class="campo full"><span>Tamanhos (separe por vírgula)</span><input data-g="tamanhos" placeholder="Ex.: P, M, G, GG">
            <span class="acoes" style="margin-top:6px">${cfg.tamanhos.map((t) => `<button type="button" class="btn peq" data-tam="${esc(t)}">${esc(t)}</button>`).join('')}</span></label>
        </div>
        <div class="acoes" style="margin:10px 0"><button type="button" class="btn escuro" data-gerar-grade>Montar grade</button><span class="muted small" id="gradeInfo"></span></div>
        <div id="gradeTab"></div>
      </div>`,
    botoes: [
      ...(editando ? [
        { t: 'Excluir', cls: 'perigo', acao: async ({ close }) => { if (await excluir(p)) close(); return false; } },
        { t: p.ativo === false ? 'Reativar' : 'Inativar', acao: () => { store.commit([{ op: 'update', col: 'produtos', id: p.id, data: { ativo: p.ativo === false, atualizadoEm: Date.now() } }]); toast('Produto atualizado.', 'ok'); } },
        { t: 'Etiquetas', acao: () => enviarParaEtiquetas([{ produtoId: p.id, qtd: Math.max(1, Number(p.estoque) || 1) }]) },
        { t: 'Nova variação', acao: () => { formProduto({ ...p, id: undefined, codigo: '', estoque: 0, custo: custoDe(p.id) }); } }
      ] : []),
      { t: 'Cancelar' },
      { t: 'Salvar', cls: 'prim', acao: () => salvar() }
    ]
  });
  const c = m.corpo;
  const atualizarMargem = () => {
    const pr = num($('[name=preco]', c).value);
    const cu = num($('[name=custo]', c).value);
    $('#margem', c).innerHTML = pr && cu
      ? `Lucro por unidade: <b>${esc(brl(pr - cu))}</b> · Margem: <b>${esc(pct((pr - cu) / pr))}</b> · Markup: <b>${esc(pct((pr - cu) / cu))}</b>`
      : '<span class="muted">Informe custo e preço para ver a margem.</span>';
  };
  $('[name=preco]', c).oninput = atualizarMargem;
  $('[name=custo]', c).oninput = atualizarMargem;
  atualizarMargem();
  $$('[name=origem]', c).forEach((r) => { r.onchange = () => $('#boxCons', c).classList.toggle('hidden', !$('[name=origem][value=consignado]', c).checked); });
  $('[data-gerar]', c).onclick = () => { $('[name=codigo]', c).value = gerarEAN(codigosExistentes()); };
  $('[data-cam]', c).onclick = () => abrirScanner({ onCode: (cod) => { $('[name=codigo]', c).value = cod; } });

  const abas = $('#abasModo', c);
  if (abas) abas.onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    modo = b.dataset.m;
    $$('[data-m]', abas).forEach((x) => x.classList.toggle('ativo', x === b));
    $('#boxUnico', c).classList.toggle('hidden', modo !== 'unico');
    $('#boxGrade', c).classList.toggle('hidden', modo !== 'grade');
  };
  $$('[data-tam]', c).forEach((b) => {
    b.onclick = () => {
      const inp = $('[data-g=tamanhos]', c);
      const l = listaCSV(inp.value);
      if (!l.includes(b.dataset.tam)) l.push(b.dataset.tam);
      inp.value = l.join(', ');
    };
  });
  const gerarGrade = () => {
    const tipos = listaCSV($('[data-g=tipos]', c).value);
    const cores = listaCSV($('[data-g=cores]', c).value);
    const tams = listaCSV($('[data-g=tamanhos]', c).value);
    const usados = codigosExistentes();
    grade = [];
    for (const tipo of tipos.length ? tipos : ['']) for (const cor of cores.length ? cores : ['']) for (const tamanho of tams.length ? tams : ['']) {
      const codigo = gerarEAN(usados); usados.add(codigo);
      grade.push({ tipo, cor, tamanho, codigo, estoque: 0 });
    }
    if (grade.length === 1 && !grade[0].tipo && !grade[0].cor && !grade[0].tamanho) grade = [];
    desenharGrade();
  };
  const desenharGrade = () => {
    $('#gradeInfo', c).textContent = grade.length ? `${grade.length} variação(ões)` : '';
    $('#gradeTab', c).innerHTML = grade.length ? `<div class="tabela-wrap"><table><thead><tr><th>Variação</th><th>Código</th><th class="num">Estoque inicial</th><th></th></tr></thead><tbody>
      ${grade.map((g, i) => `<tr data-i="${i}"><td>${esc([g.tipo, g.cor, g.tamanho].filter(Boolean).join(' / '))}</td>
        <td><input class="mono" data-k="codigo" value="${esc(g.codigo)}" style="min-width:150px"></td>
        <td class="num"><input data-k="estoque" inputmode="numeric" value="${g.estoque}" style="width:80px;text-align:right"></td>
        <td><button type="button" class="btn icone peq fantasma" data-del>${ic('lixo')}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Preencha ao menos um campo acima e clique em <b>Montar grade</b>.</p>';
  };
  $('[data-gerar-grade]', c).onclick = gerarGrade;
  $('#gradeTab', c).oninput = (e) => {
    const tr = e.target.closest('[data-i]');
    if (!tr || !e.target.dataset.k) return;
    const g = grade[Number(tr.dataset.i)];
    g[e.target.dataset.k] = e.target.dataset.k === 'estoque' ? Math.round(num(e.target.value)) : normalizaCodigo(e.target.value);
  };
  $('#gradeTab', c).onclick = (e) => {
    const tr = e.target.closest('[data-i]');
    if (tr && e.target.closest('[data-del]')) { grade.splice(Number(tr.dataset.i), 1); desenharGrade(); }
  };
  desenharGrade();

  function salvar() {
    const f = lerForm(c);
    const nome = f.nome;
    const preco = arred(num(f.preco));
    const custoN = arred(num(f.custo));
    if (!nome) { toast('Informe o nome do produto.', 'erro'); return false; }
    if (!preco) { toast('Informe o preço de venda.', 'erro'); return false; }
    const consignanteId = f.origem === 'consignado' ? f.consignanteId || null : null;
    if (f.origem === 'consignado' && !consignanteId) { toast('Selecione o consignante.', 'erro'); return false; }
    const agora = Date.now();
    const base = {
      nome, categoria: f.categoria, descricao: f.descricao, preco, estoqueMin: Math.round(num(f.estoqueMin)),
      consignanteId, atualizadoEm: agora
    };
    const usados = codigosExistentes();
    if (editando) usados.delete(p.codigo);

    const itens = modo === 'grade' && !editando
      ? grade.map((g) => ({ tipo: g.tipo, cor: g.cor, tamanho: g.tamanho, codigo: normalizaCodigo(g.codigo), estoque: g.estoque }))
      : [{ tipo: f.tipo, cor: f.cor, tamanho: f.tamanho, codigo: normalizaCodigo(f.codigo), estoque: Math.round(num(f.estoque)) }];
    if (!itens.length) { toast('Monte a grade de variações.', 'erro'); return false; }
    for (const it of itens) {
      if (it.codigo && usados.has(it.codigo)) { toast(`O código ${it.codigo} já pertence a outro produto.`, 'erro'); return false; }
      if (it.codigo) usados.add(it.codigo);
      if (/^\d{13}$/.test(it.codigo) && !eanValido(it.codigo)) toast(`Aviso: ${it.codigo} não é um EAN-13 válido (dígito verificador).`, 'alerta', 5000);
    }

    const ops = [];
    if (editando) {
      const it = itens[0];
      ops.push({ op: 'update', col: 'produtos', id: p.id, data: { ...base, tipo: it.tipo, cor: it.cor, tamanho: it.tamanho, codigo: it.codigo } });
      ops.push({ op: 'set', col: 'custos', id: p.id, data: { custo: custoN, atualizadoEm: agora } });
      const delta = it.estoque - (Number(p.estoque) || 0);
      if (delta) ops.push(...opsMovimento({ produto: { ...p, ...base, ...it }, qtd: delta, tipo: 'ajuste', motivo: 'Ajuste no cadastro', agora }));
    } else {
      for (const it of itens) {
        const id = store.newId();
        const prod = { ...base, tipo: it.tipo, cor: it.cor, tamanho: it.tamanho, codigo: it.codigo, grupo: modo === 'grade' ? nome : '', ativo: true, estoque: 0, criadoEm: agora };
        ops.push({ op: 'set', col: 'produtos', id, data: prod });
        ops.push({ op: 'set', col: 'custos', id, data: { custo: custoN, atualizadoEm: agora } });
        if (it.estoque) ops.push(...opsMovimento({ produto: { ...prod, id }, qtd: it.estoque, tipo: 'entrada', motivo: 'Estoque inicial', agora }));
      }
    }
    store.commit(ops);
    toast(editando ? 'Produto atualizado.' : `${itens.length} produto(s) cadastrado(s).`, 'ok');
    return true;
  }
  return m;
}

async function excluir(p) {
  const ok = await confirmar(`Excluir definitivamente "${nomeProduto(p)}"? As vendas antigas continuam no histórico. Se preferir manter o cadastro, use "Inativar".`, { ok: 'Excluir', perigo: true });
  if (!ok) return false;
  store.commit([{ op: 'delete', col: 'produtos', id: p.id }, { op: 'delete', col: 'custos', id: p.id }]);
  toast('Produto excluído.', 'ok');
  return true;
}

// =====================================================================
//  Importar / exportar planilha
// =====================================================================
const COLS = ['nome', 'categoria', 'tipo', 'cor', 'tamanho', 'codigo', 'custo', 'preco', 'estoque', 'estoque_minimo', 'consignante', 'descricao'];

function exportarProdutos() {
  const X = window.XLSX;
  const linhas = state.produtos.map((p) => ({
    nome: p.nome, categoria: p.categoria || '', tipo: p.tipo || '', cor: p.cor || '', tamanho: p.tamanho || '',
    codigo: p.codigo || '', custo: custoDe(p.id), preco: Number(p.preco) || 0, estoque: Number(p.estoque) || 0,
    estoque_minimo: Number(p.estoqueMin) || 0, consignante: consignanteNome(p.consignanteId), descricao: p.descricao || ''
  }));
  const ws = X.utils.json_to_sheet(linhas.length ? linhas : [Object.fromEntries(COLS.map((k) => [k, '']))], { header: COLS });
  ws['!cols'] = COLS.map((k) => ({ wch: ['nome', 'descricao'].includes(k) ? 34 : 14 }));
  // códigos como texto para não virarem notação científica
  linhas.forEach((_, i) => { const ref = X.utils.encode_cell({ r: i + 1, c: COLS.indexOf('codigo') }); if (ws[ref]) ws[ref].t = 's'; });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Produtos');
  X.writeFile(wb, `produtos_encanto_espacial.xlsx`);
}

function importarPlanilha() {
  let linhas = [];
  const m = modal({
    titulo: 'Importar produtos de planilha',
    largo: true,
    html: `<p>Use uma planilha Excel (.xlsx) ou CSV com as colunas:</p>
      <p class="mono small">${COLS.join(', ')}</p>
      <ul class="small muted">
        <li>Linhas com <b>código já cadastrado</b> atualizam o cadastro (nome, categoria, preços, mínimo). O estoque <b>não</b> é alterado.</li>
        <li>Linhas novas são cadastradas com o estoque informado. Sem código? Ele é gerado automaticamente.</li>
        <li>Na coluna <b>consignante</b>, informe o nome do artesão/parceiro (será criado se não existir).</li>
      </ul>
      <div class="acoes" style="margin:10px 0">
        <button type="button" class="btn" data-modelo>${ic('baixar')} Baixar modelo / produtos atuais</button>
        <label class="btn prim">${ic('subir')} Escolher arquivo<input type="file" accept=".xlsx,.xls,.csv" hidden data-arq></label>
      </div>
      <div data-prev></div>`,
    botoes: [{ t: 'Cancelar' }, { t: 'Importar', cls: 'prim', acao: () => importar() }]
  });
  const c = m.corpo;
  $('[data-modelo]', c).onclick = exportarProdutos;
  $('[data-arq]', c).onchange = async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      const wb = window.XLSX.read(await arq.arrayBuffer(), { type: 'array' });
      const bruto = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      linhas = bruto.map((r) => {
        const o = {};
        for (const [k, v] of Object.entries(r)) o[semAcento(k).replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')] = String(v).trim();
        return o;
      }).filter((r) => r.nome);
      const novos = linhas.filter((r) => !produtoPorCodigo(r.codigo)).length;
      $('[data-prev]', c).innerHTML = `<div class="aviso-demo" style="background:var(--teal-claro);color:var(--navy)">
        ${linhas.length} linha(s) válidas: <b>${novos}</b> novo(s) e <b>${linhas.length - novos}</b> atualização(ões).</div>
        <div class="tabela-wrap" style="max-height:260px"><table><thead><tr><th>Nome</th><th>Variação</th><th>Código</th><th class="num">Custo</th><th class="num">Preço</th><th class="num">Estoque</th></tr></thead><tbody>
        ${linhas.slice(0, 100).map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc([r.tipo, r.cor, r.tamanho].filter(Boolean).join(' / '))}</td><td class="mono">${esc(r.codigo)}</td><td class="num">${esc(r.custo)}</td><td class="num">${esc(r.preco)}</td><td class="num">${esc(r.estoque)}</td></tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) { toast(`Não foi possível ler o arquivo: ${err.message}`, 'erro'); }
  };

  function importar() {
    if (!linhas.length) { toast('Escolha um arquivo primeiro.', 'alerta'); return false; }
    const agora = Date.now();
    const ops = [];
    const usados = codigosExistentes();
    const consPorNome = new Map(state.consignantes.map((x) => [semAcento(x.nome), x.id]));
    let novos = 0, atualizados = 0;
    for (const r of linhas) {
      let consignanteId = null;
      if (r.consignante) {
        const k = semAcento(r.consignante);
        if (!consPorNome.has(k)) {
          const id = store.newId();
          consPorNome.set(k, id);
          ops.push({ op: 'set', col: 'consignantes', id, data: { nome: r.consignante, ativo: true, criadoEm: agora } });
        }
        consignanteId = consPorNome.get(k);
      }
      const base = {
        nome: r.nome, categoria: r.categoria || '', tipo: r.tipo || '', cor: r.cor || '', tamanho: r.tamanho || '',
        descricao: r.descricao || '', preco: arred(num(r.preco)), estoqueMin: Math.round(num(r.estoque_minimo)), consignanteId, atualizadoEm: agora
      };
      const codigo = normalizaCodigo(r.codigo);
      const existente = codigo && produtoPorCodigo(codigo);
      if (existente) {
        ops.push({ op: 'update', col: 'produtos', id: existente.id, data: base });
        if (r.custo !== '' && r.custo !== undefined) ops.push({ op: 'set', col: 'custos', id: existente.id, data: { custo: arred(num(r.custo)), atualizadoEm: agora } });
        atualizados++;
      } else {
        const id = store.newId();
        const cod = codigo && !usados.has(codigo) ? codigo : gerarEAN(usados);
        usados.add(cod);
        const prod = { ...base, codigo: cod, grupo: '', ativo: true, estoque: 0, criadoEm: agora };
        ops.push({ op: 'set', col: 'produtos', id, data: prod });
        ops.push({ op: 'set', col: 'custos', id, data: { custo: arred(num(r.custo)), atualizadoEm: agora } });
        const est = Math.round(num(r.estoque));
        if (est) ops.push(...opsMovimento({ produto: { ...prod, id }, qtd: est, tipo: 'entrada', motivo: 'Importação de planilha', agora }));
        novos++;
      }
    }
    store.commit(ops);
    toast(`Importação concluída: ${novos} novo(s), ${atualizados} atualizado(s).`, 'ok', 5000);
    return true;
  }
}
