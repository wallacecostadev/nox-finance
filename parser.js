/**
 * Parser de mensagens - Entende comandos do usuário
 */

// Mapeamento de palavras para categorias
const CATEGORIAS = {
  // Alimentacao
  mercado: 'alimentacao',
  ifood: 'alimentacao',
  restaurante: 'alimentacao',
  lanche: 'alimentacao',
  comida: 'alimentacao',
  almoco: 'alimentacao',
  jantar: 'alimentacao',
  // Transporte
  uber: 'transporte',
  '99': 'transporte',
  taxi: 'transporte',
  onibus: 'transporte',
  gasolina: 'transporte',
  combustivel: 'transporte',
  // Contas
  luz: 'contas',
  energia: 'contas',
  agua: 'contas',
  internet: 'contas',
  telefone: 'contas',
  celular: 'contas',
  // Moradia
  aluguel: 'moradia',
  // Receitas
  salario: 'salario',
  freelance: 'receita',
  propina: 'extra',
  presente: 'extra',
  // Saude
  farmacia: 'saude',
  remedio: 'saude',
  consulta: 'saude',
  // Lazer
  cinema: 'lazer',
  netflix: 'lazer',
  spotify: 'lazer',
  jogo: 'lazer',
  // Cartao
  cartao: 'cartao',
  credito: 'cartao',
  fatura: 'cartao',
};

// Palavras-chave para identificar tipo
const PALAVRAS_RECEITA = ['recebi', 'ganhei', 'entrei', 'entrada', 'salario', 'pagamento', 'deposito', 'salário', 'depósito'];
const PALAVRAS_DESPESA = ['gastei', 'gasto', 'paguei', 'pago', 'comprei', 'compra', 'fiei', 'fiado', 'devo', 'gaste', 'gasta'];
const PALAVRAS_CARTAO = ['cartao', 'crédito', 'credito', 'fatura', 'parcela', 'parcial'];

function extrairValor(texto) {
  const match = texto.match(/(\d+[.,]?\d*)/);
  if (match) {
    return parseFloat(match[0].replace(',', '.'));
  }
  return null;
}

function identificarTipo(texto) {
  if (PALAVRAS_RECEITA.some(p => texto.includes(p))) return 'receita';
  if (PALAVRAS_DESPESA.some(p => texto.includes(p))) return 'despesa';
  if (PALAVRAS_CARTAO.some(p => texto.includes(p))) return 'cartao';
  return null;
}

function identificarCategoria(texto) {
  const textoLower = texto.toLowerCase();
  for (const [palavra, categoria] of Object.entries(CATEGORIAS)) {
    if (textoLower.includes(palavra)) {
      return categoria;
    }
  }
  return 'outros';
}

function identificarConsulta(texto) {
  const textoLower = texto.toLowerCase();
  const temValor = /\d+[.,]?\d*/.test(textoLower);

  // Se tem valor numérico, não é consulta
  if (temValor) {
    return null;
  }

  // Padrao para 'quanto' - verifica se nao tem acao junto
  if (textoLower.includes('quanto')) {
    if (textoLower.includes('gastei') || textoLower.includes('gasto') || textoLower.includes('gastos')) {
      if (textoLower.includes('semana')) return { tipo: 'consulta', o: 'gastos', periodo: 'semana' };
      if (textoLower.includes('mês') || textoLower.includes('mes')) return { tipo: 'consulta', o: 'gastos', periodo: 'mes' };
      if (textoLower.includes('hoje')) return { tipo: 'consulta', o: 'gastos', periodo: 'hoje' };
      return { tipo: 'consulta', o: 'gastos', periodo: 'mes' };
    }
    if (textoLower.includes('receita') || textoLower.includes('receitas')) {
      if (textoLower.includes('semana')) return { tipo: 'consulta', o: 'receitas', periodo: 'semana' };
      if (textoLower.includes('mês') || textoLower.includes('mes')) return { tipo: 'consulta', o: 'receitas', periodo: 'mes' };
      return { tipo: 'consulta', o: 'receitas', periodo: 'mes' };
    }
    return { tipo: 'saldo' };
  }

  if (textoLower.includes('saldo')) {
    return { tipo: 'saldo' };
  }
  if (textoLower.includes('ajuda') || textoLower.includes('comandos')) {
    return { tipo: 'ajuda' };
  }
  if (textoLower.includes('gastos')) {
    if (textoLower.includes('semana')) return { tipo: 'consulta', o: 'gastos', periodo: 'semana' };
    if (textoLower.includes('mês') || textoLower.includes('mes')) return { tipo: 'consulta', o: 'gastos', periodo: 'mes' };
    if (textoLower.includes('hoje')) return { tipo: 'consulta', o: 'gastos', periodo: 'hoje' };
    return { tipo: 'consulta', o: 'gastos', periodo: 'mes' };
  }
  if (textoLower.includes('receita') || textoLower.includes('receitas')) {
    if (textoLower.includes('semana')) return { tipo: 'consulta', o: 'receitas', periodo: 'semana' };
    if (textoLower.includes('mês') || textoLower.includes('mes')) return { tipo: 'consulta', o: 'receitas', periodo: 'mes' };
    return { tipo: 'consulta', o: 'receitas', periodo: 'mes' };
  }
  if (textoLower.includes('extrato') || textoLower.includes('últimos') || textoLower.includes('ultimos')) {
    return { tipo: 'extrato' };
  }
  if (textoLower.includes('cartão') || textoLower.includes('cartao') || textoLower.includes('fatura')) {
    return { tipo: 'cartao' };
  }
  return null;
}

function parsearMensagem(mensagem) {
  const texto = mensagem.toLowerCase().trim();
  const consulta = identificarConsulta(texto);
  if (consulta) {
    return consulta;
  }
  const tipo = identificarTipo(texto);
  if (!tipo) {
    return { tipo: 'desconhecido' };
  }
  const valor = extrairValor(texto);
  const categoria = identificarCategoria(texto);
  let descricao = texto
    .replace(/[0-9.,]+/g, '')
    .replace(/gastei|gasto|paguei|pago|comprei|compra|recebi|ganhei|entrei/g, '')
    .trim();

  return { tipo, valor, categoria, descricao: descricao || categoria };
}

module.exports = { parsearMensagem, CATEGORIAS };
