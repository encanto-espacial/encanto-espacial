// Escolhe automaticamente o armazenamento: Firebase (se configurado) ou local (demonstração).
import { FIREBASE_CONFIG } from '../config.js';

const usaFirebase = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
const mod = usaFirebase ? await import('./firebase.js') : await import('./local.js');

export const store = mod.createStore(FIREBASE_CONFIG);
