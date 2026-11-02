// Inicialização, login, layout e navegação.
import { store, state, on, emit, iniciarDados, pararDados, isSocio, nomeUsuario, PAPEIS } from './state.js';
import { $, $$, esc, toast, lerForm, diaISO } from './util.js';
import { ic } from './icones.js';

import * as painel from './views/painel.js';
import * as pdv from './views/pdv.js';
import * as vendas from './views/vendas.js';
import * as produtos from './views/produtos.js';
import * as estoque from './views/estoque.js';
import * as etiquetas from './views/etiquetas.js';
import * as consignacao from './views/consignacao.js';
import * as relatorios from './views/relatorios.js';
import * as usuarios from './views/usuarios.js';
import * as configuracoes from './views/configuracoes.js';

const ROTAS = {
  painel: { t: 'Painel de vendas', i: 'painel', v: painel, socio: true },
  pdv: { t: 'Vender (PDV)', i: 'carrinho', v: pdv },
  vendas: { t: 'Vendas', i: 'recibo', v: vendas },
  produtos: { t: 'Produtos', i: 'caixa', v: produtos },
  estoque: { t: 'Entrada e saída', i: 'setas', v: estoque },
  etiquetas: { t: 'Etiquetas', i: 'etiqueta', v: etiquetas },
  consignacao: { t: 'Consignação', i: 'maos', v: consignacao, socio: true },
  relatorios: { t: 'Relatórios', i: 'relatorio', v: relatorios, socio: true },
  usuarios: { t: 'Usuários', i: 'usuarios', v: usuarios, socio: true },
  configuracoes: { t: 'Configurações', i: 'config', v: configuracoes, socio: true }
};

const app = document.getElementById('app');
let limparView = null;
let unsubPerfil = null;

// ---------------------------------------------------------------------
//  Autenticação
// ---------------------------------------------------------------------
store.onError((e) => toast(`Falha ao sincronizar: ${e.message}`, 'erro', 6000));

store.onUser((user) => {
  state.user = user;
  unsubPerfil && unsubPerfil();
  unsubPerfil = null;
  pararDados();
  if (!user) { state.perfil = null; return telaLogin(); }
  telaCarregando();
  unsubPerfil = store.subscribeDoc('usuarios', user.uid, (perfil, meta) => {
    const antes = state.perfil;
    state.perfil = perfil;
    if (!perfil) {
      if (meta?.fromCache) return; // aguardando servidor
      return telaPrimeiroAcesso();
    }
    if (perfil.papel === 'pendente' || perfil.ativo === false) return telaAguardando(perfil);
    // Reinicia o app só se o papel mudou (ou primeira carga)
    if (!antes || antes.papel !== perfil.papel || antes.ativo !== perfil.ativo || !$('.layout')) {
      iniciarDados();
      montarLayout();
    } else emit('perfil');
  });
});

function avisoDemo() {
  return store.modo === 'local'
    ? `<div class="aviso-demo"><b>Modo demonstração:</b> os dados ficam salvos só neste aparelho.
       Para sincronizar entre celular, tablet e notebook, configure o Firebase (veja o README).</div>`
    : '';
}

function telaCarregando() {
  app.innerHTML = `<div class="splash"><img src="assets/logo.jpg" alt="" width="120" height="120"><p>Carregando…</p></div>`;
}

function telaLogin(modo = 'entrar') {
  const criar = modo === 'criar';
  app.innerHTML = `<div class="auth">
    <img class="logo" src="assets/logo.jpg" alt="Logo Encanto Espacial">
    <h1>Encanto Espacial</h1>
    <p class="sub">Estoque, vendas e consignação</p>
    <form class="caixa" id="fLogin">
      ${avisoDemo()}
      <h2>${criar ? 'Criar conta' : 'Entrar'}</h2>
      <div class="grid" style="gap:12px">
        <label class="campo"><span>E-mail</span><input name="email" type="email" autocomplete="username" required autofocus></label>
        <label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="${criar ? 'new-password' : 'current-password'}" minlength="6" required></label>
        <button class="btn prim grande bloco" type="submit">${criar ? 'Criar conta' : 'Entrar'}</button>
        <div class="acoes" style="justify-content:space-between">
          <button type="button" class="btn fantasma peq" data-alt>${criar ? 'Já tenho conta' : 'Criar conta'}</button>
          ${criar ? '' : '<button type="button" class="btn fantasma peq" data-esqueci>Esqueci a senha</button>'}
        </div>
      </div>
      ${criar ? '<p class="dica">Depois de criar a conta, um sócio precisa liberar seu acesso.</p>' : ''}
    </form></div>`;
  const f = $('#fLogin');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const { email, senha } = lerForm(f);
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try { criar ? await store.cadastrar(email, senha) : await store.login(email, senha); } catch (err) { toast(err.message, 'erro'); } finally { btn.disabled = false; }
  };
  f.querySelector('[data-alt]').onclick = () => telaLogin(criar ? 'entrar' : 'criar');
  const esq = f.querySelector('[data-esqueci]');
  if (esq) esq.onclick = async () => {
    const email = f.email.value.trim();
    if (!email) return toast('Digite seu e-mail primeiro.', 'alerta');
    try { await store.resetSenha(email); toast('Enviamos um link de redefinição para seu e-mail.', 'ok'); } catch (err) { toast(err.message, 'erro'); }
  };
}

function telaPrimeiroAcesso() {
  app.innerHTML = `<div class="auth">
    <img class="logo" src="assets/logo.jpg" alt="">
    <h1>Bem-vindo(a)!</h1>
    <form class="caixa" id="fPrim">
      <p>Conectado como <b>${esc(state.user.email)}</b>.</p>
      <label class="campo"><span>Seu nome</span><input name="nome" required autofocus placeholder="Como aparecerá nas vendas"></label>
      <p class="dica" data-info>Verificando cadastro da loja…</p>
      <button class="btn prim grande bloco" type="submit" disabled>Continuar</button>
      <button class="btn fantasma bloco" type="button" data-sair style="margin-top:8px">Sair</button>
    </form></div>`;
  const f = $('#fPrim');
  const info = f.querySelector('[data-info]');
  const btn = f.querySelector('[type=submit]');
  let lojaNova = null;
  const off = store.subscribeDoc('config', 'setup', (d, meta) => {
    if (!d && meta?.fromCache) return;
    lojaNova = !d;
    info.innerHTML = lojaNova
      ? '<b>Você é o primeiro usuário.</b> Sua conta será criada como <b>Sócio administrador</b>, com acesso total.'
      : 'Sua solicitação de acesso será enviada para aprovação de um sócio.';
    btn.disabled = false;
  });
  f.querySelector('[data-sair]').onclick = () => { off(); store.logout(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const nome = f.nome.value.trim();
    if (!nome) return;
    btn.disabled = true;
    off();
    const agora = Date.now();
    const base = { nome, email: state.user.email, criadoEm: agora, ativo: true };
    const ops = lojaNova
      ? [{ op: 'set', col: 'config', id: 'setup', data: { socioUid: state.user.uid, criadoEm: agora } },
        { op: 'set', col: 'usuarios', id: state.user.uid, data: { ...base, papel: 'socio' } }]
      : [{ op: 'set', col: 'usuarios', id: state.user.uid, data: { ...base, papel: 'pendente' } }];
    try { await store.commit(ops); } catch (err) { toast(err.message, 'erro'); btn.disabled = false; }
  };
}

function telaAguardando(perfil) {
  pararDados();
  app.innerHTML = `<div class="auth">
    <img class="logo" src="assets/logo.jpg" alt="">
    <h1>Olá, ${esc(perfil.nome)}!</h1>
    <div class="caixa center">
      <h2>${perfil.ativo === false ? 'Acesso desativado' : 'Aguardando liberação'}</h2>
      <p class="muted">${perfil.ativo === false ? 'Seu acesso foi desativado por um sócio.' : 'Peça a um sócio para liberar seu acesso em <b>Usuários</b>. Esta tela atualiza sozinha.'}</p>
      <button class="btn bloco" data-sair>Sair</button>
    </div></div>`;
  $('[data-sair]').onclick = () => store.logout();
}

// ---------------------------------------------------------------------
//  Layout e rotas
// ---------------------------------------------------------------------
function rotasPermitidas() {
  return Object.entries(ROTAS).filter(([, r]) => !r.socio || isSocio());
}

function montarLayout() {
  app.innerHTML = `<div class="layout">
    <aside class="lateral" id="lateral">
      <div class="marca"><img src="assets/logo.jpg" alt=""><div><b>${esc(state.config.nome)}</b><span>Colares – PA</span></div></div>
      <nav id="nav"></nav>
      <div class="rodape">
        <div><b style="color:#fff">${esc(nomeUsuario())}</b></div>
        <div style="color:#8f9bd0">${esc(PAPEIS[state.perfil.papel] || '')}</div>
        <button class="btn fantasma peq" data-sair>${ic('sair')} Sair</button>
      </div>
    </aside>
    <div class="fundo-menu" id="fundoMenu"></div>
    <div class="conteudo">
      <header class="topo">
        <button class="btn icone fantasma menu-btn" id="btnMenu" aria-label="Menu">${ic('menu')}</button>
        <h1 id="titulo"></h1>
        <span class="status" id="status"></span>
      </header>
      <main id="main"></main>
    </div></div>`;
  $('#nav').innerHTML = rotasPermitidas().map(([k, r]) => `<a href="#/${k}" data-rota="${k}">${ic(r.i)}<span>${esc(r.t)}</span></a>`).join('');
  const lat = $('#lateral');
  const fundo = $('#fundoMenu');
  const fecharMenu = () => { lat.classList.remove('aberta'); fundo.classList.remove('aberto'); };
  $('#btnMenu').onclick = () => { lat.classList.add('aberta'); fundo.classList.add('aberto'); };
  fundo.onclick = fecharMenu;
  $('#nav').onclick = (e) => { if (e.target.closest('a')) fecharMenu(); };
  $('[data-sair]').onclick = () => store.logout();
  atualizarStatus();
  navegar();
}

function atualizarStatus() {
  const el = $('#status');
  if (!el) return;
  const { online, pendentes } = state.status;
  if (store.modo === 'local') { el.className = 'status demo'; el.textContent = 'Demonstração'; return; }
  el.className = `status ${online ? '' : 'off'}`;
  el.textContent = online ? (pendentes ? `Sincronizando (${pendentes})` : 'Online') : `Offline${pendentes ? ` · ${pendentes} pendente(s)` : ''}`;
  el.title = online ? 'Dados sincronizados com a nuvem' : 'Sem internet: as operações ficam salvas no aparelho e sincronizam quando a conexão voltar.';
}
on('status', atualizarStatus);
on('config', () => { const b = $('.lateral .marca b'); if (b) b.textContent = state.config.nome; });

function navegar() {
  const main = $('#main');
  if (!main) return;
  const permitidas = rotasPermitidas();
  let [rota, ...args] = location.hash.replace(/^#\/?/, '').split('/');
  if (!permitidas.find(([k]) => k === rota)) {
    rota = isSocio() ? 'painel' : 'pdv';
    history.replaceState(null, '', `#/${rota}`);
  }
  const r = ROTAS[rota];
  $$('#nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota));
  $('#titulo').textContent = r.t;
  document.title = `${r.t} · ${state.config.nome}`;
  if (limparView) { try { limparView(); } catch (e) { console.error(e); } limparView = null; }
  main.innerHTML = '';
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try { limparView = r.v.render(main, args.map(decodeURIComponent)) || null; } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card"><h2>Erro ao abrir a tela</h2><p class="muted">${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', navegar);

// ---------------------------------------------------------------------
//  Service worker (funcionamento offline)
// ---------------------------------------------------------------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}
window.__ee = { state, store, diaISO };
