// Gestão de usuários e perfis (somente sócios).
import { state, store, on, PAPEIS } from '../state.js';
import { $, esc, fmtData, modal, toast, lerForm, confirmar } from '../util.js';

export function render(main) {
  main.innerHTML = `<div class="card">
      <h2>Como adicionar um vendedor ou sócio</h2>
      <ol class="small" style="margin:0;padding-left:20px;line-height:1.7">
        <li>A pessoa abre o app no aparelho dela e toca em <b>Criar conta</b> (e-mail e senha).</li>
        <li>Ela informa o nome e a solicitação aparece aqui como <span class="tag alerta">Aguardando aprovação</span>.</li>
        <li>Clique na pessoa, escolha o perfil (<b>Vendedor</b> ou <b>Sócio</b>) e salve.</li>
      </ol>
      <p class="dica"><b>Vendedor:</b> vende, consulta produtos (sem ver custo/lucro), registra entradas/saídas, imprime etiquetas e vê apenas as próprias vendas.
      <b>Sócio:</b> acesso total – painel, relatórios, custos, consignação, cancelamentos, usuários e configurações.</p>
    </div>
    <div class="card" style="padding:0"><div id="uLista"></div></div>`;

  const desenhar = () => {
    const us = [...state.usuarios].sort((a, b) => (a.papel === 'pendente' ? -1 : 0) - (b.papel === 'pendente' ? -1 : 0));
    $('#uLista', main).innerHTML = us.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Desde</th></tr></thead><tbody>
      ${us.map((u) => `<tr class="clicavel" data-id="${u.id}"><td><b>${esc(u.nome)}</b>${u.id === state.user.uid ? ' <span class="tag teal">você</span>' : ''}</td><td>${esc(u.email)}</td>
        <td><span class="tag ${u.papel === 'pendente' ? 'alerta' : u.papel === 'socio' ? 'roxo' : 'teal'}">${esc(PAPEIS[u.papel] || u.papel)}</span></td>
        <td>${u.ativo === false ? '<span class="tag perigo">Desativado</span>' : '<span class="tag ok">Ativo</span>'}</td><td>${esc(fmtData(u.criadoEm))}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum usuário.</div>';
  };
  $('#uLista', main).onclick = (e) => {
    const tr = e.target.closest('[data-id]');
    if (tr) editar(state.usuarios.find((u) => u.id === tr.dataset.id));
  };
  desenhar();
  return on('usuarios', desenhar);
}

function editar(u) {
  const eu = u.id === state.user.uid;
  modal({
    titulo: u.nome,
    html: `<div class="form">
      <label class="campo full"><span>Nome</span><input name="nome" value="${esc(u.nome)}"></label>
      <label class="campo"><span>Perfil</span><select name="papel" ${eu ? 'disabled' : ''}>${Object.entries(PAPEIS).map(([k, t]) => `<option value="${k}" ${k === u.papel ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="ativo" ${u.ativo !== false ? 'checked' : ''} ${eu ? 'disabled' : ''}> Acesso ativo</label>
      ${eu ? '<p class="dica full">Você não pode alterar seu próprio perfil (evita a loja ficar sem sócio).</p>' : ''}
    </div>`,
    botoes: [
      ...(eu ? [] : [{
        t: 'Remover', cls: 'perigo', acao: async () => {
          if (!await confirmar(`Remover o acesso de ${u.nome}? O histórico de vendas é mantido.`, { perigo: true, ok: 'Remover' })) return false;
          store.commit([{ op: 'delete', col: 'usuarios', id: u.id }]);
          toast('Usuário removido.', 'ok');
        }
      }]),
      { t: 'Cancelar' },
      {
        t: 'Salvar', cls: 'prim', acao: ({ corpo }) => {
          const f = lerForm(corpo);
          const data = { nome: f.nome || u.nome };
          if (!eu) { data.papel = f.papel; data.ativo = f.ativo; }
          store.commit([{ op: 'update', col: 'usuarios', id: u.id, data }]);
          toast('Usuário atualizado.', 'ok');
        }
      }
    ]
  });
}
