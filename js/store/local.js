// Armazenamento LOCAL (modo demonstração): dados ficam no navegador deste aparelho.
// Implementa a mesma interface do store do Firebase.
import { novoId } from '../util.js';

const PFX = 'ee_db_';
const AUTH_USERS = 'ee_auth_usuarios';
const AUTH_ATUAL = 'ee_auth_atual';

export function createStore() {
  const cache = {};
  const subs = new Set();
  const authCbs = new Set();
  const statusCbs = new Set();

  const load = (col) => {
    if (!cache[col]) {
      try { cache[col] = JSON.parse(localStorage.getItem(PFX + col) || '{}'); } catch { cache[col] = {}; }
    }
    return cache[col];
  };
  const save = (col) => {
    try { localStorage.setItem(PFX + col, JSON.stringify(cache[col] || {})); } catch (e) {
      throw new Error('Armazenamento do navegador cheio. Faça um backup e configure o Firebase.');
    }
  };

  const cmp = (a, op, b) => {
    switch (op) {
      case '==': return a === b;
      case '!=': return a !== b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '<': return a < b;
      case 'in': return b.includes(a);
      case 'array-contains': return Array.isArray(a) && a.includes(b);
      default: return true;
    }
  };
  const run = (col, opts = {}) => {
    let arr = Object.entries(load(col)).map(([id, d]) => ({ ...d, id }));
    for (const [f, op, v] of opts.where || []) arr = arr.filter((d) => cmp(d[f], op, v));
    if (opts.orderBy) {
      const [f, dir] = opts.orderBy;
      arr.sort((x, y) => (x[f] > y[f] ? 1 : x[f] < y[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    return arr;
  };
  const fire = (s) => {
    if (s.id) {
      const d = load(s.col)[s.id];
      s.cb(d ? { ...d, id: s.id } : null, { fromCache: false });
    } else s.cb(run(s.col, s.opts));
  };
  const notify = (cols) => queueMicrotask(() => { for (const s of subs) if (cols.has(s.col)) fire(s); });

  const aplicar = (base, data) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && '__inc' in v) out[k] = (Number(out[k]) || 0) + v.__inc;
      else if (v === undefined) continue;
      else out[k] = v;
    }
    return out;
  };

  const store = {
    modo: 'local',
    inc: (n) => ({ __inc: n }),
    newId: () => novoId(),

    subscribe(col, opts, cb) {
      const s = { col, opts: opts || {}, cb };
      subs.add(s);
      queueMicrotask(() => subs.has(s) && fire(s));
      return () => subs.delete(s);
    },
    subscribeDoc(col, id, cb) {
      const s = { col, id, cb };
      subs.add(s);
      queueMicrotask(() => subs.has(s) && fire(s));
      return () => subs.delete(s);
    },
    async query(col, opts) { return run(col, opts); },

    /** ops: [{op:'set'|'update'|'delete', col, id, data, merge}] */
    commit(ops) {
      const cols = new Set();
      for (const o of ops) {
        const tab = load(o.col);
        if (o.op === 'delete') delete tab[o.id];
        else if (o.op === 'update') {
          if (!tab[o.id]) throw new Error(`Documento não encontrado: ${o.col}/${o.id}`);
          tab[o.id] = aplicar(tab[o.id], o.data);
        } else tab[o.id] = aplicar(o.merge ? tab[o.id] || {} : {}, o.data);
        cols.add(o.col);
      }
      for (const c of cols) save(c);
      notify(cols);
      return Promise.resolve();
    },

    // ---------- Status ----------
    onStatus(cb) { statusCbs.add(cb); cb({ online: navigator.onLine, pendentes: 0 }); return () => statusCbs.delete(cb); },
    onError() { return () => {}; },

    // ---------- Autenticação local (apenas demonstração) ----------
    onUser(cb) {
      authCbs.add(cb);
      const atual = localStorage.getItem(AUTH_ATUAL);
      const us = JSON.parse(localStorage.getItem(AUTH_USERS) || '{}');
      const u = Object.entries(us).find(([, v]) => v.uid === atual);
      queueMicrotask(() => cb(u ? { uid: u[1].uid, email: u[0] } : null));
      return () => authCbs.delete(cb);
    },
    async login(email, senha) {
      email = email.toLowerCase();
      const us = JSON.parse(localStorage.getItem(AUTH_USERS) || '{}');
      const h = await hash(senha);
      if (!us[email] || us[email].hash !== h) throw new Error('E-mail ou senha incorretos.');
      localStorage.setItem(AUTH_ATUAL, us[email].uid);
      authCbs.forEach((cb) => cb({ uid: us[email].uid, email }));
    },
    async cadastrar(email, senha) {
      email = email.toLowerCase();
      if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      const us = JSON.parse(localStorage.getItem(AUTH_USERS) || '{}');
      if (us[email]) throw new Error('Este e-mail já está cadastrado.');
      us[email] = { uid: novoId(), hash: await hash(senha) };
      localStorage.setItem(AUTH_USERS, JSON.stringify(us));
      localStorage.setItem(AUTH_ATUAL, us[email].uid);
      authCbs.forEach((cb) => cb({ uid: us[email].uid, email }));
    },
    async logout() {
      localStorage.removeItem(AUTH_ATUAL);
      authCbs.forEach((cb) => cb(null));
    },
    async resetSenha() {
      throw new Error('No modo demonstração não há recuperação de senha. Crie outra conta.');
    }
  };
  return store;
}

async function hash(s) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ee:' + s));
    return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0;
    for (const c of 'ee:' + s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return String(h);
  }
}
