/**
 * Parser de mensagens - entende comandos do usuario.
 */

const CATEGORIAS = {
  mercado: 'alimentacao',
  ifood: 'alimentacao',
  restaurante: 'alimentacao',
  lanche: 'alimentacao',
  comida: 'alimentacao',
  almoco: 'alimentacao',
  jantar: 'alimentacao',
  uber: 'transporte',
  '99': 'transporte',
  taxi: 'transporte',
  onibus: 'transporte',
  gasolina: 'transporte',
  combustivel: 'transporte',
  luz: 'contas',
  energia: 'contas',
  agua: 'contas',
  internet: 'contas',
  telefone: 'contas',
  celular: 'contas',
  aluguel: 'moradia',
  salario: 'salario',
  freelance: 'receita',
  propina: 'extra',
  presente: 'extra',
  farmacia: 'saude',
  remedio: 'saude',
  consulta: 'saude',
  cinema: 'lazer',
  netflix: 'lazer',
  spotify: 'lazer',
  jogo: 'lazer',
  cartao: 'cartao',
  credito: 'cartao',
  fatura: 'cartao',
};

const PALAVRAS_RECEITA = ['recebi', 'ganhei', 'entrei', 'entrada', 'salario', 'pagamento', 'deposito'];
const PALAVRAS_DESPESA = ['gastei', 'gasto', 'paguei', 'pago', 'comprei', 'compra', 'fiei', 'fiado', 'devo', 'gaste', 'gasta'];
const PALAVRAS_CARTAO = ['cartao', 'credito', 'fatura', 'parcela', 'parcial'];

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extrairValor(texto) {
  const match = texto.match(/(\d+[.,]?\d*)/);
  if (match) return Number(match[0].replace(',', '.'));
  return null;
}

function extrairNumeroDepoisDe(texto, palavra) {
  const match = texto.match(new RegExp(`${palavra}\\s+(?:de\\s+|dia\\s+)?(\\d+[.,]?\\d*)`));
  return match ? Number(match[1].replace(',', '.')) : null;
}

function identificarTipo(texto) {
  if (PALAVRAS_RECEITA.some(p => texto.includes(p))) return 'receita';
  if (PALAVRAS_CARTAO.some(p => texto.includes(p))) return 'cartao';
  if (PALAVRAS_DESPESA.some(p => texto.includes(p))) return 'despesa';
  return null;
}

function identificarCategoria(texto) {
  for (const [palavra, categoria] of Object.entries(CATEGORIAS)) {
    if (texto.includes(palavra)) return categoria;
  }
  return 'outros';
}

function identificarFormaPagamento(texto, tipo) {
  if (texto.includes('pix')) return 'pix';
  if (texto.includes('debito')) return 'debito';
  if (texto.includes('dinheiro') || texto.includes('especie')) return 'dinheiro';
  if (texto.includes('credito') || texto.includes('cartao') || tipo === 'cartao') return 'credito';
  return tipo === 'receita' ? 'entrada' : 'nao_informado';
}

function extrairNomeCartao(texto) {
  const match = texto.match(/(?:cartao|credito|fatura)\s+(?:do|da|de)?\s*([a-z0-9 ]+)/);
  if (!match) return null;

  let nome = match[1]
    .replace(/limite.*$/, '')
    .replace(/vencimento.*$/, '')
    .replace(/vence.*$/, '')
    .replace(/fechamento.*$/, '')
    .replace(/fecha.*$/, '')
    .replace(/valor.*$/, '')
    .trim();

  for (const palavra of Object.keys(CATEGORIAS)) {
    nome = nome.replace(new RegExp(`\\s+(no|na|em|de|do|da)?\\s*${palavra}.*$`), '').trim();
  }

  if (/^\d/.test(nome)) return null;
  return nome || null;
}

function identificarConsulta(texto) {
  const temValor = /\d+[.,]?\d*/.test(texto);
  if (temValor) return null;

  if (texto.includes('ajuda') || texto.includes('comandos')) return { tipo: 'ajuda' };
  if (
    texto === 'cartao' ||
    texto === 'cartoes' ||
    texto.includes('meu cartao') ||
    texto.includes('meus cartoes') ||
    texto.includes('listar cartao') ||
    texto.includes('listar cartoes')
  ) {
    return { tipo: 'listar_cartoes' };
  }
  if (texto.includes('fatura') || texto.includes('cartao de credito') || texto.includes('cartao credito')) {
    return { tipo: 'fatura', cartao: extrairNomeCartao(texto) };
  }
  if (texto.includes('extrato') || texto.includes('ultimos')) return { tipo: 'extrato' };
  if (texto.includes('saldo') || texto.includes('quanto')) {
    if (texto.includes('gasto') || texto.includes('gastei') || texto.includes('gastos')) {
      return { tipo: 'consulta', o: 'gastos', periodo: identificarPeriodo(texto) };
    }
    if (texto.includes('receita') || texto.includes('receitas')) {
      return { tipo: 'consulta', o: 'receitas', periodo: identificarPeriodo(texto) };
    }
    return { tipo: 'saldo' };
  }
  if (texto.includes('gastos')) return { tipo: 'consulta', o: 'gastos', periodo: identificarPeriodo(texto) };
  if (texto.includes('receita') || texto.includes('receitas')) return { tipo: 'consulta', o: 'receitas', periodo: identificarPeriodo(texto) };

  return null;
}

function identificarPeriodo(texto) {
  if (texto.includes('semana')) return 'semana';
  if (texto.includes('hoje')) return 'hoje';
  return 'mes';
}

function parsearCadastroCartao(texto) {
  const mencionaCartao = /(cartao|credito)/.test(texto);
  const temAcaoCadastro = /(cadastrar|cadastre|cadastrei|cadastra|cadastrado|criar|crie|criei|adicionar|adicione|adicionei|add|tenho|meu|minha).*(cartao|credito)/.test(texto);
  const temDadosDeCartao = mencionaCartao && /(limite|vencimento|vence|fechamento|fecha)/.test(texto);
  const pareceGasto = PALAVRAS_DESPESA.some(p => texto.includes(p));
  const ehCadastro = temAcaoCadastro || (temDadosDeCartao && !pareceGasto);
  if (!ehCadastro) return null;

  const limite = extrairNumeroDepoisDe(texto, 'limite') || extrairValor(texto);
  const vencimento = extrairNumeroDepoisDe(texto, 'vencimento') || extrairNumeroDepoisDe(texto, 'vence');
  const fechamento = extrairNumeroDepoisDe(texto, 'fechamento') || extrairNumeroDepoisDe(texto, 'fecha');
  const nomeMatch = texto.match(/(?:cartao|credito)\s+(?:um|uma|o|a|meu|minha|do|da|de)?\s*([a-z0-9 ]+?)(?:\s+com|\s+limite|\s+vencimento|\s+vence|\s+fechamento|\s+fecha|$)/);
  const nome = nomeMatch ? limparNomeCartaoCadastro(nomeMatch[1]) : null;

  return {
    tipo: 'cadastrar_cartao',
    nome: nome || 'cartao',
    limite: limite || 0,
    vencimento,
    fechamento
  };
}

function limparNomeCartaoCadastro(nome) {
  const limpo = String(nome || '')
    .replace(/\b(um|uma|o|a|meu|minha|do|da|de)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return limpo || null;
}

function parsearCorrecao(texto) {
  if (!/(corrigir|corrija|editar|alterar|ajustar)/.test(texto)) return null;

  const idMatch = texto.match(/(?:lancamento|id)?\s*(\d+)/);
  const valor = extrairNumeroDepoisDe(texto, 'valor');
  const formaPagamento = identificarFormaPagamento(texto, null);
  const cartao = formaPagamento === 'credito' ? extrairNomeCartao(texto) : null;

  return {
    tipo: 'corrigir',
    alvo: texto.includes('ultimo') || texto.includes('ultima') ? 'ultimo' : 'id',
    id: idMatch ? Number(idMatch[1]) : null,
    valor,
    formaPagamento: formaPagamento === 'nao_informado' ? null : formaPagamento,
    cartao
  };
}

function parsearExclusao(texto) {
  if (!/(apagar|excluir|deletar|remover|cancelar)/.test(texto)) return null;

  const idMatch = texto.match(/(?:lancamento|id)?\s*(\d+)/);
  return {
    tipo: 'excluir',
    alvo: texto.includes('ultimo') || texto.includes('ultima') ? 'ultimo' : 'id',
    id: idMatch ? Number(idMatch[1]) : null
  };
}

function limparDescricao(texto) {
  const descricao = texto
    .replace(/[0-9.,]+/g, '')
    .replace(/gastei|gasto|paguei|pago|comprei|compra|recebi|ganhei|entrei/g, '')
    .replace(/no credito|no debito|no pix|em pix|dinheiro|cartao|credito|debito/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return /^(no|na|de|do|da|em|com)$/.test(descricao) ? '' : descricao;
}

function parsearMensagem(mensagem) {
  const texto = normalizar(mensagem);

  const cadastroCartao = parsearCadastroCartao(texto);
  if (cadastroCartao) return cadastroCartao;

  const correcao = parsearCorrecao(texto);
  if (correcao) return correcao;

  const exclusao = parsearExclusao(texto);
  if (exclusao) return exclusao;

  const consulta = identificarConsulta(texto);
  if (consulta) return consulta;

  const tipo = identificarTipo(texto);
  if (!tipo) return { tipo: 'desconhecido' };

  const valor = extrairValor(texto);
  const categoria = identificarCategoria(texto);
  const formaPagamento = identificarFormaPagamento(texto, tipo);
  const cartao = formaPagamento === 'credito' ? extrairNomeCartao(texto) : null;
  let descricao = limparDescricao(texto);
  if (cartao) {
    descricao = descricao.replace(new RegExp(`\\b${cartao}\\b`, 'i'), '').replace(/\s+/g, ' ').trim();
  }

  return {
    tipo: formaPagamento === 'credito' ? 'cartao' : tipo,
    valor,
    categoria,
    descricao: descricao || categoria,
    formaPagamento,
    cartao
  };
}

module.exports = { parsearMensagem, CATEGORIAS };
