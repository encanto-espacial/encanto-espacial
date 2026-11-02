// Configurações da loja, backup/restauração e dados de exemplo.
import { state, store, opsMovimento, nomeProduto, nomeUsuario, registrarLog } from '../state.js';
import { $, esc, toast, lerForm, listaCSV, num, baixarArquivo, confirmar, diaISO, gerarEAN, numeroVenda, arred } from '../util.js';
import { ic } from '../icones.js';

const COLECOES = ['produtos', 'imagens', 'custos', 'consignantes', 'vendas', 'movimentos', 'acertos', 'usuarios', 'config'];

export function render(main) {
  const c = state.config;
  main.innerHTML = `
    <div class="card"><h2>Dados da loja</h2>
      <div class="form" id="fLoja">
        <label class="campo"><span>Nome da loja</span><input name="nome" value="${esc(c.nome)}"></label>
        <label class="campo"><span>Slogan</span><input name="slogan" value="${esc(c.slogan || '')}"></label>
        <label class="campo"><span>Endereço</span><input name="endereco" value="${esc(c.endereco || '')}"></label>
        <label class="campo"><span>Telefone / WhatsApp</span><input name="telefone" value="${esc(c.telefone || '')}"></label>
        <label class="campo"><span>Instagram</span><input name="instagram" value="${esc(c.instagram || '')}"></label>
        <label class="campo"><span>Desconto máximo do vendedor (%)</span><input name="descontoMaxVendedor" inputmode="decimal" value="${esc(c.descontoMaxVendedor)}"></label>
        <label class="campo full"><span>Mensagem no comprovante</span><input name="mensagemCupom" value="${esc(c.mensagemCupom || '')}"></label>
        <label class="campo full"><span>Categorias (separe por vírgula)</span><textarea name="categorias">${esc(c.categorias.join(', '))}</textarea></label>
        <label class="campo full"><span>Tamanhos sugeridos (separe por vírgula)</span><input name="tamanhos" value="${esc(c.tamanhos.join(', '))}"></label>
      </div>
      <div class="acoes" style="margin-top:12px"><button class="btn prim" id="btnSalvarLoja">Salvar</button></div>
    </div>

    <div class="card"><h2>Sincronização</h2>
      ${store.modo === 'local'
        ? `<p><span class="status demo">Modo demonstração</span></p><p class="small">Os dados estão salvos <b>somente neste navegador</b>. Para usar em vários aparelhos, com acesso de qualquer lugar e backup na nuvem,
          configure o Firebase (gratuito) seguindo o <b>README.md</b>. Depois, use <b>Exportar backup</b> aqui e <b>Importar backup</b> na versão conectada para levar os dados.</p>`
        : `<p><span class="status">Firebase conectado</span></p><p class="small">Os dados são sincronizados entre todos os aparelhos. Sem internet, o app continua funcionando e envia as operações quando a conexão voltar.
          ${state.status.pendentes ? `<br><b>${state.status.pendentes} operação(ões) aguardando envio.</b>` : ''}</p>`}
    </div>

    <div class="card"><h2>Backup</h2>
      <p class="small muted">Recomendado: exporte um backup semanalmente e guarde no Google Drive.</p>
      <div class="acoes">
        <button class="btn" id="btnBackup">${ic('baixar')} Exportar backup (JSON)</button>
        <label class="btn">${ic('subir')} Importar backup<input type="file" accept=".json" hidden id="arqBackup"></label>
      </div>
    </div>

    <div class="card"><h2>Instalar no celular / tablet</h2>
      <p class="small"><b>Android (Chrome):</b> menu ⋮ → <i>Instalar app</i> ou <i>Adicionar à tela inicial</i>.<br>
      <b>iPhone/iPad (Safari):</b> botão Compartilhar → <i>Adicionar à Tela de Início</i>.<br>
      <b>Notebook (Chrome/Edge):</b> ícone de instalar na barra de endereço.</p>
    </div>

    ${state.produtos.length === 0 ? `<div class="card"><h2>Dados de exemplo</h2>
      <p class="small muted">Para conhecer o sistema, carregue produtos, um consignante e vendas fictícias dos últimos 30 dias. Você pode apagá-los depois.</p>
      <button class="btn" id="btnExemplo">Carregar dados de exemplo</button></div>` : ''}`;

  $('#btnSalvarLoja', main).onclick = () => {
    const f = lerForm($('#fLoja', main));
    const novo = {
      nome: f.nome || 'Encanto Espacial', slogan: f.slogan, endereco: f.endereco, telefone: f.telefone, instagram: f.instagram,
      mensagemCupom: f.mensagemCupom, descontoMaxVendedor: num(f.descontoMaxVendedor),
      categorias: listaCSV(f.categorias), tamanhos: listaCSV(f.tamanhos)
    };
    const ROT = { nome: 'Nome', slogan: 'Slogan', endereco: 'Endereço', telefone: 'Telefone', instagram: 'Instagram', mensagemCupom: 'Mensagem do comprovante', descontoMaxVendedor: 'Desconto máx. vendedor (%)', categorias: 'Categorias', tamanhos: 'Tamanhos' };
    const mud = Object.keys(novo).filter((k) => JSON.stringify(novo[k] ?? '') !== JSON.stringify(state.config[k] ?? ''))
      .map((k) => Array.isArray(novo[k]) ? `${ROT[k]} alteradas` : `${ROT[k]}: ${state.config[k] ?? ''} → ${novo[k]}`);
    store.commit([{ op: 'set', col: 'config', id: 'loja', merge: true, data: novo }]);
    if (mud.length) registrarLog('config', `Configurações da loja: ${mud.join('; ')}`, { alteracoes: mud });
    toast('Configurações salvas.', 'ok');
  };

  $('#btnBackup', main).onclick = async () => {
    try {
      const dados = { app: 'encanto-espacial', versao: 1, geradoEm: new Date().toISOString(), colecoes: {} };
      for (const col of COLECOES) dados.colecoes[col] = await store.query(col, {});
      baixarArquivo(`backup_encanto_espacial_${diaISO()}.json`, JSON.stringify(dados));
      registrarLog('backup_exportado', `Exportou backup (${Object.values(dados.colecoes).reduce((s, l) => s + l.length, 0)} registros)`);
      toast('Backup gerado.', 'ok');
    } catch (e) { toast(`Erro no backup: ${e.message}`, 'erro'); }
  };

  $('#arqBackup', main).onchange = async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      const dados = JSON.parse(await arq.text());
      if (dados.app !== 'encanto-espacial') throw new Error('Arquivo não é um backup do Encanto Espacial.');
      const n = Object.values(dados.colecoes).reduce((s, l) => s + l.length, 0);
      if (!await confirmar(`Importar ${n} registro(s)? Registros com o mesmo identificador serão substituídos. Usuários não são importados.`, { ok: 'Importar' })) return;
      const ops = [];
      for (const [col, lista] of Object.entries(dados.colecoes)) {
        if (col === 'usuarios' || !COLECOES.includes(col)) continue;
        for (const d of lista) {
          if (col === 'config' && d.id !== 'loja') continue;
          const { id, ...data } = d;
          ops.push({ op: 'set', col, id, data });
        }
      }
      store.commit(ops);
      registrarLog('backup_importado', `Importou backup de ${dados.geradoEm || 'data desconhecida'} (${ops.length} registros)`, { arquivo: arq.name });
      toast(`Backup importado (${ops.length} registros).`, 'ok', 5000);
    } catch (err) { toast(err.message, 'erro', 6000); } finally { e.target.value = ''; }
  };

  const be = $('#btnExemplo', main);
  if (be) be.onclick = () => { carregarExemplo(); toast('Dados de exemplo carregados!', 'ok'); setTimeout(() => { location.hash = '#/painel'; }, 300); };
}

function carregarExemplo() {
  const agora = Date.now();
  const ops = [];
  const usados = new Set();
  const consId = store.newId();
  ops.push({ op: 'set', col: 'consignantes', id: consId, data: { nome: 'Dona Raimunda (cerâmica)', telefone: '91 99999-0000', pix: '', cidade: 'Colares', ativo: true, criadoEm: agora } });
  const catalogo = [
    ['Camiseta Disco Voador', 'Camisetas', 22, 59.9, ['Preta', 'Branca'], ['P', 'M', 'G', 'GG'], 4],
    ['Camiseta Eu Fui a Colares', 'Camisetas', 20, 49.9, ['Azul'], ['P', 'M', 'G'], 5],
    ['Boné ET Colares', 'Bonés', 15, 39.9, [], [], 12],
    ['Chaveiro Disco Voador', 'Chaveiros', 3.5, 12, [], [], 40],
    ['Chaveiro Farol de Colares', 'Chaveiros', 3.5, 12, [], [], 35],
    ['Ímã de geladeira Ilha de Colares', 'Ímãs', 2.8, 10, [], [], 60],
    ['Caneca Operação Prato', 'Canecas', 14, 35, [], [], 18],
    ['Caneca Alienígena', 'Canecas', 14, 35, [], [], 2],
    ['Doce de cupuaçu', 'Doces regionais', 6, 15, [], [], 25],
    ['Bombom de bacuri', 'Doces regionais', 1.2, 3.5, [], [], 80],
    ['Quadro Praia do Machadinho', 'Decoração', 30, 80, [], [], 5]
  ];
  const criados = [];
  for (const [nome, categoria, custo, preco, cores, tams, est] of catalogo) {
    for (const cor of cores.length ? cores : ['']) for (const tamanho of tams.length ? tams : ['']) {
      const id = store.newId();
      const codigo = gerarEAN(usados); usados.add(codigo);
      const p = { nome, categoria, cor, tamanho, tipo: '', codigo, preco, estoqueMin: 3, consignanteId: null, ativo: true, estoque: 0, grupo: cores.length || tams.length ? nome : '', descricao: '', criadoEm: agora, atualizadoEm: agora };
      ops.push({ op: 'set', col: 'produtos', id, data: p }, { op: 'set', col: 'custos', id, data: { custo } });
      ops.push(...opsMovimento({ produto: { ...p, id }, qtd: est * 3, tipo: 'entrada', motivo: 'Estoque inicial', agora }));
      criados.push({ ...p, id, estoqueIni: est * 3 });
    }
  }
  for (const [nome, custo, preco, est] of [['Vaso de cerâmica marajoara P', 25, 60, 6], ['Vaso de cerâmica marajoara G', 45, 110, 3]]) {
    const id = store.newId();
    const codigo = gerarEAN(usados); usados.add(codigo);
    const p = { nome, categoria: 'Cerâmica', cor: '', tamanho: '', tipo: '', codigo, preco, estoqueMin: 1, consignanteId: consId, ativo: true, estoque: 0, grupo: '', descricao: '', criadoEm: agora, atualizadoEm: agora };
    ops.push({ op: 'set', col: 'produtos', id, data: p }, { op: 'set', col: 'custos', id, data: { custo } });
    ops.push(...opsMovimento({ produto: { ...p, id }, qtd: est, tipo: 'entrada', motivo: 'Consignação recebida', agora }));
    criados.push({ ...p, id, estoqueIni: est });
  }
  // Vendas fictícias nos últimos 30 dias
  const pags = ['pix', 'pix', 'pix', 'dinheiro', 'debito', 'credito'];
  const restante = new Map(criados.map((p) => [p.id, p.estoqueIni]));
  for (let d = 29; d >= 0; d--) {
    const n = 2 + Math.floor(Math.random() * (d % 7 === 0 || d % 7 === 6 ? 8 : 4));
    for (let k = 0; k < n; k++) {
      const quando = new Date(); quando.setDate(quando.getDate() - d); quando.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));
      if (quando.getTime() > agora) continue;
      const itens = [];
      for (let j = 0; j < 1 + Math.floor(Math.random() * 3); j++) {
        const p = criados[Math.floor(Math.random() * criados.length)];
        if ((restante.get(p.id) || 0) < 1 || itens.find((i) => i.produtoId === p.id)) continue;
        restante.set(p.id, restante.get(p.id) - 1);
        itens.push({ produtoId: p.id, nome: nomeProduto(p), codigo: p.codigo, categoria: p.categoria, consignanteId: p.consignanteId, qtd: 1, preco: p.preco });
      }
      if (!itens.length) continue;
      const subtotal = arred(itens.reduce((s, i) => s + i.preco * i.qtd, 0));
      const id = store.newId();
      const t = quando.getTime();
      ops.push({ op: 'set', col: 'vendas', id, data: {
        numero: numeroVenda(quando), criadoEm: t, dia: diaISO(quando), hora: quando.getHours(), vendedorUid: state.user.uid, vendedorNome: nomeUsuario(),
        itens, qtdItens: itens.length, subtotal, desconto: 0, total: subtotal, pagamento: pags[Math.floor(Math.random() * pags.length)], recebido: subtotal, troco: 0, cliente: '', obs: 'exemplo', status: 'ok'
      } });
      for (const i of itens) ops.push(...opsMovimento({ produto: criados.find((p) => p.id === i.produtoId), qtd: -i.qtd, tipo: 'venda', motivo: 'Venda', vendaId: id, agora: t }));
    }
  }
  store.commit(ops);
  registrarLog('exemplo', `Carregou dados de exemplo (${criados.length} produtos e vendas fictícias)`);
}
