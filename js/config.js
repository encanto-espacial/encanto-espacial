// =====================================================================
//  CONFIGURAÇÃO DO FIREBASE (banco de dados na nuvem, plano gratuito)
// ---------------------------------------------------------------------
//  Enquanto FIREBASE_CONFIG for null, o sistema roda em MODO DEMONSTRAÇÃO:
//  os dados ficam salvos apenas no aparelho/navegador em uso.
//
//  Para sincronizar entre celular, tablet e notebook, crie um projeto no
//  Firebase (passo a passo no README.md) e cole aqui o objeto de
//  configuração do app Web. Exemplo:
//
//  export const FIREBASE_CONFIG = {
//    apiKey: "AIza...",
//    authDomain: "encanto-espacial.firebaseapp.com",
//    projectId: "encanto-espacial",
//    storageBucket: "encanto-espacial.appspot.com",
//    messagingSenderId: "1234567890",
//    appId: "1:1234567890:web:abcdef"
//  };
//
//  Esses valores NÃO são senhas: a proteção dos dados é feita pelas
//  regras do arquivo firestore.rules e pelo login de cada usuário.
// =====================================================================
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCezEN03d9Tv5rHrb08sK9OxBrGsZEjENk',
  authDomain: 'encanto-espacial.firebaseapp.com',
  projectId: 'encanto-espacial',
  storageBucket: 'encanto-espacial.firebasestorage.app',
  messagingSenderId: '93653361992',
  appId: '1:93653361992:web:f354208b478b600fd17f7d'
};

export const LOJA_PADRAO = {
  nome: 'Encanto Espacial',
  slogan: 'Lembranças de Colares – Pará',
  endereco: 'Colares – PA',
  telefone: '',
  instagram: '',
  mensagemCupom: 'Obrigado pela visita! Volte sempre a Colares 🛸',
  descontoMaxVendedor: 10,
  categorias: ['Camisetas', 'Bonés', 'Chaveiros', 'Ímãs', 'Canecas', 'Artesanato', 'Cerâmica', 'Bijuterias', 'Doces regionais', 'Decoração', 'Outros'],
  tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG', '2', '4', '6', '8', '10', '12', '14'],
  etiqueta: { papel: 'rolo', largura: 50, altura: 30, colunas: 1, espaco: 2, mostrarLoja: true, mostrarNome: true, mostrarPreco: true }
};
