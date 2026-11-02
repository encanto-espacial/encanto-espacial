// Armazenamento na NUVEM com Firebase (Auth + Firestore) — plano gratuito "Spark".
// O Firestore guarda uma cópia local (IndexedDB): o app funciona offline e
// sincroniza sozinho quando a internet volta.
import {
  initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, getDocs, writeBatch, increment, query, where, orderBy
} from '../../vendor/firebase.js';

const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos. Se ainda não tem conta, toque em "Criar conta".',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem internet. O primeiro login precisa de conexão.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'permission-denied': 'Permissão negada para esta operação.'
};
const traduz = (e) => new Error(ERROS[e?.code] || e?.message || 'Erro desconhecido');

/** Firestore não aceita undefined: remove recursivamente. */
function limpar(v) {
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === 'object' && v.constructor === Object) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = limpar(x);
    return o;
  }
  return v;
}

export function createStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });

  let pendentes = 0;
  const statusCbs = new Set();
  const errCbs = new Set();
  const emitStatus = () => statusCbs.forEach((cb) => cb({ online: navigator.onLine, pendentes }));
  window.addEventListener('online', emitStatus);
  window.addEventListener('offline', emitStatus);
  const emitErro = (e) => errCbs.forEach((cb) => cb(traduz(e)));

  const montaQuery = (col, opts = {}) => {
    const partes = (opts.where || []).map(([f, op, v]) => where(f, op, v));
    if (opts.orderBy) partes.push(orderBy(opts.orderBy[0], opts.orderBy[1] || 'asc'));
    return query(collection(db, col), ...partes);
  };
  const converte = (data) => {
    const o = {};
    for (const [k, v] of Object.entries(limpar(data))) {
      o[k] = v && typeof v === 'object' && '__inc' in v ? increment(v.__inc) : v;
    }
    return o;
  };

  return {
    modo: 'firebase',
    inc: (n) => ({ __inc: n }),
    newId: () => doc(collection(db, '_')).id,

    subscribe(col, opts, cb) {
      return onSnapshot(montaQuery(col, opts), (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
        (e) => { console.error(col, e); emitErro(e); });
    },
    subscribeDoc(col, id, cb) {
      return onSnapshot(doc(db, col, id), { includeMetadataChanges: true },
        (s) => cb(s.exists() ? { ...s.data(), id: s.id } : null, { fromCache: s.metadata.fromCache }),
        (e) => { console.error(col, id, e); emitErro(e); });
    },
    async query(col, opts) {
      try {
        const snap = await getDocs(montaQuery(col, opts));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      } catch (e) { throw traduz(e); }
    },

    /**
     * Grava várias operações de forma atômica. Offline, a gravação entra na fila
     * local e a promessa só termina quando sincronizar — por isso as telas não aguardam.
     */
    commit(ops) {
      const lotes = [];
      for (let i = 0; i < ops.length; i += 450) lotes.push(ops.slice(i, i + 450));
      const promessas = lotes.map((lote) => {
        const b = writeBatch(db);
        for (const o of lote) {
          const ref = doc(db, o.col, o.id);
          if (o.op === 'delete') b.delete(ref);
          else if (o.op === 'update') b.update(ref, converte(o.data));
          else b.set(ref, converte(o.data), o.merge ? { merge: true } : undefined);
        }
        pendentes++; emitStatus();
        return b.commit().then(
          () => { pendentes--; emitStatus(); },
          (e) => { pendentes--; emitStatus(); console.error(e); emitErro(e); throw traduz(e); }
        );
      });
      const p = Promise.all(promessas);
      p.catch(() => {}); // erro já informado via onError
      return p;
    },

    onStatus(cb) { statusCbs.add(cb); cb({ online: navigator.onLine, pendentes }); return () => statusCbs.delete(cb); },
    onError(cb) { errCbs.add(cb); return () => errCbs.delete(cb); },

    onUser(cb) { return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null)); },
    async login(email, senha) { try { await signInWithEmailAndPassword(auth, email, senha); } catch (e) { throw traduz(e); } },
    async cadastrar(email, senha) { try { await createUserWithEmailAndPassword(auth, email, senha); } catch (e) { throw traduz(e); } },
    async logout() { await signOut(auth); },
    async resetSenha(email) { try { await sendPasswordResetEmail(auth, email); } catch (e) { throw traduz(e); } }
  };
}
