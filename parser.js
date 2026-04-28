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

const MESES = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

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
    .replace(/hoje.*$/, '')
    .replace(/ontem.*$/, '')
    .replace(/anteontem.*$/, '')
    .replace(/semana passada.*$/, '')
    .replace(/semana anterior.*$/, '')
    .replace(/semana.*$/, '')
    .replace(/mes passado.*$/, '')
    .replace(/mes anterior.*$/, '')
    .replace(/mes.*$/, '')
    .replace(/ano passado.*$/, '')
    .replace(/ano anterior.*$/, '')
    .replace(/ano.*$/, '')
    .replace(/\s+(em|dia)\s+\d.*$/, '')
    .trim();

  for (const palavra of Object.keys(CATEGORIAS)) {
    nome = nome.replace(new RegExp(`\\s+(no|na|em|de|do|da)?\\s*${palavra}.*$`), '').trim();
  }

  if (/^\d/.test(nome)) return null;
  return nome || null;
}

function identificarConsulta(texto) {
  const periodo = identificarPeriodo(texto);

  if (texto.includes('ajuda') || texto.includes('comandos')) return { tipo: 'ajuda' };
  if (
    texto.includes('parcelamento') ||
    texto.includes('parcelamentos') ||
    texto.includes('parceladas') ||
    texto.includes('parcelados') ||
    texto.includes('dividas') ||
    texto.includes('divida')
  ) {
    const filtro = texto.includes('divida') || texto.includes('dividas')
      ? 'divida'
      : texto.includes('compra') || texto.includes('compras')
        ? 'compra'
        : null;
    return { tipo: 'listar_parcelamentos', filtro };
  }
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
    return { tipo: 'fatura', cartao: extrairNomeCartao(texto), periodo };
  }
  if (texto.includes('extrato') || texto.includes('ultimos')) return { tipo: 'extrato', periodo };
  if (texto.includes('saldo') || texto.includes('quanto')) {
    if (texto.includes('gasto') || texto.includes('gastei') || texto.includes('gastos')) {
      return { tipo: 'consulta', o: 'gastos', periodo };
    }
    if (texto.includes('receita') || texto.includes('receitas')) {
      return { tipo: 'consulta', o: 'receitas', periodo };
    }
    return { tipo: 'saldo', periodo };
  }
  if (texto.includes('gastos')) return { tipo: 'consulta', o: 'gastos', periodo };
  if (texto.includes('receita') || texto.includes('receitas')) return { tipo: 'consulta', o: 'receitas', periodo };

  return null;
}

function identificarPeriodo(texto) {
  const dataCompleta = texto.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (dataCompleta) {
    return {
      tipo: 'dia_especifico',
      dia: Number(dataCompleta[1]),
      mes: Number(dataCompleta[2]),
      ano: dataCompleta[3] ? normalizarAno(dataCompleta[3]) : null
    };
  }

  for (const [nome, numero] of Object.entries(MESES)) {
    if (texto.includes(nome)) {
      const anoMatch = texto.match(new RegExp(nome + '\\s+(\\d{4})')) || texto.match(/\b(20\d{2})\b/);
      return { tipo: 'mes_especifico', mes: numero, ano: anoMatch ? Number(anoMatch[1]) : null };
    }
  }

  if (texto.includes('ontem')) return { tipo: 'ontem' };
  if (texto.includes('anteontem')) return { tipo: 'anteontem' };
  if (texto.includes('hoje')) return { tipo: 'hoje' };
  if (texto.includes('semana passada') || texto.includes('semana anterior')) return { tipo: 'semana_passada' };
  if (texto.includes('semana')) return { tipo: 'semana' };
  if (texto.includes('mes passado') || texto.includes('mes anterior')) return { tipo: 'mes_passado' };
  if (texto.includes('mes')) return { tipo: 'mes' };
  if (texto.includes('ano passado') || texto.includes('ano anterior')) return { tipo: 'ano_passado' };
  if (texto.includes('ano')) return { tipo: 'ano' };
  return { tipo: 'mes' };
}

function extrairDataLancamento(texto) {
  const periodo = identificarPeriodo(texto);
  const hoje = inicioDoDia(new Date());

  if (periodo.tipo === 'dia_especifico') {
    const ano = periodo.ano || hoje.getFullYear();
    return formatarDataISO(new Date(ano, periodo.mes - 1, periodo.dia));
  }

  if (periodo.tipo === 'ontem') return formatarDataISO(adicionarDias(hoje, -1));
  if (periodo.tipo === 'anteontem') return formatarDataISO(adicionarDias(hoje, -2));
  if (periodo.tipo === 'hoje') return formatarDataISO(hoje);

  if (periodo.tipo === 'mes_passado') {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - 1, Math.min(hoje.getDate(), 28));
    return formatarDataISO(data);
  }

  if (periodo.tipo === 'mes_especifico') {
    const ano = periodo.ano || hoje.getFullYear();
    return formatarDataISO(new Date(ano, periodo.mes - 1, 1));
  }

  return formatarDataISO(hoje);
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function adicionarDias(data, dias) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

function formatarDataISO(data) {
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, '0'),
    String(data.getDate()).padStart(2, '0')
  ].join('-');
}

function normalizarAno(ano) {
  const valor = Number(ano);
  return valor < 100 ? 2000 + valor : valor;
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

function parsearCadastroParcelamento(texto) {
  const parcela = texto.match(/(?:parcelado\s+em\s+|em\s+)?(\d{1,2})x\b/) || texto.match(/\b(\d{1,2})\s+parcelas?\b/);
  const composto = texto.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const mencionaParcelado = parcela || composto || texto.includes('parcelado') || texto.includes('parcelamento') || texto.includes('divida');
  const temAcao = /(cadastre|cadastrar|crie|criar|registre|registrar|tenho|fiz|comprei|peguei)/.test(texto);

  if (!mencionaParcelado || !temAcao) return null;

  const totalParcelas = parcela ? Number(parcela[1]) : Number(composto?.[2] || 0);
  if (!totalParcelas) return null;

  const parcelaAtual = composto ? Number(composto[1]) : 1;
  const valorPorParcela = texto.match(/\b(?:de|por|parcela de|parcelas de)\s+(\d+[.,]?\d*)/);
  const valorParcela = valorPorParcela
    ? Number(valorPorParcela[1].replace(',', '.'))
    : extrairNumeroDepoisDe(texto, 'parcela') || extrairNumeroDepoisDe(texto, 'parcelas') || extrairValor(texto);
  const formaPagamento = identificarFormaPagamento(texto, null);
  const cartao = formaPagamento === 'credito' ? extrairNomeCartao(texto) : null;
  const tipoParcelamento = texto.includes('divida') || texto.includes('emprestimo') || texto.includes('acordo') ? 'divida' : 'compra';
  const descricao = limparDescricaoParcelamento(texto, cartao);

  return {
    tipo: 'cadastrar_parcelamento',
    tipoParcelamento,
    descricao,
    valorParcela,
    totalParcelas,
    parcelasPagas: Math.max(0, parcelaAtual - 1),
    formaPagamento,
    cartao,
    categoria: identificarCategoria(texto),
    dataInicio: extrairDataLancamento(texto)
  };
}

function limparDescricaoParcelamento(texto, cartao) {
  let descricao = texto
    .replace(/\b(cadastre|cadastrar|crie|criar|registre|registrar|tenho|fiz|comprei|peguei)\b/g, '')
    .replace(/\b(parcelamento|parcelado|parcelada|parceladas|parcelados|divida)\b/g, '')
    .replace(/\b(em\s+)?\d{1,2}x\b/g, '')
    .replace(/\b\d{1,2}\s+parcelas?\b/g, '')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, '')
    .replace(/\b(de|no valor de|valor|parcela|parcelas)\s+\d+[.,]?\d*/g, '')
    .replace(/\d+[.,]?\d*/g, '')
    .replace(/\b(no credito|no debito|no pix|em pix|dinheiro|cartao|credito|debito)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cartao) descricao = descricao.replace(new RegExp(`\\b${cartao}\\b`, 'i'), '').trim();
  descricao = descricao.replace(/^(em|de|do|da|no|na|com)\b\s*/g, '').trim();
  descricao = descricao.replace(/\s+\b(em|de|do|da|no|na|com)$/g, '').trim();
  return descricao || 'parcelamento';
}

function parsearEdicaoCartao(texto) {
  const mencionaCartao = /(cartao|credito)/.test(texto);
  const ehEdicao = /(editar|edite|alterar|altere|mudar|mude|ajustar|ajuste|corrigir|corrija|atualizar|atualize)/.test(texto);
  const temCampoCartao = /(limite|vencimento|vence|fechamento|fecha)/.test(texto);

  if (!mencionaCartao || !ehEdicao || !temCampoCartao) return null;

  return {
    tipo: 'editar_cartao',
    nome: extrairNomeCartaoParaComando(texto),
    limite: extrairNumeroDepoisDe(texto, 'limite'),
    vencimento: extrairNumeroDepoisDe(texto, 'vencimento') || extrairNumeroDepoisDe(texto, 'vence'),
    fechamento: extrairNumeroDepoisDe(texto, 'fechamento') || extrairNumeroDepoisDe(texto, 'fecha')
  };
}

function parsearExclusaoCartao(texto) {
  const ehExclusao = /(apagar|excluir|deletar|remover|cancelar)/.test(texto);
  const mencionaCartao = /(cartao|credito)/.test(texto);
  if (!ehExclusao || !mencionaCartao) return null;

  return {
    tipo: 'excluir_cartao',
    nome: extrairNomeCartaoParaComando(texto)
  };
}

function limparNomeCartaoCadastro(nome) {
  const limpo = String(nome || '')
    .replace(/\b(um|uma|o|a|meu|minha|do|da|de)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return limpo || null;
}

function extrairNomeCartaoParaComando(texto) {
  const semAcoes = texto
    .replace(/\b(editar|edite|alterar|altere|mudar|mude|ajustar|ajuste|corrigir|corrija|atualizar|atualize|apagar|excluir|deletar|remover|cancelar)\b/g, '')
    .replace(/\b(limite|vencimento|vence|fechamento|fecha|para|de|do|da|com|valor|dia)\b/g, '')
    .replace(/\d+[.,]?\d*/g, '')
    .replace(/\b(cartao|credito)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return semAcoes || extrairNomeCartao(texto);
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
    .replace(/\bdia\s+\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, '')
    .replace(/\bem\s+\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, '')
    .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, '')
    .replace(/[0-9.,]+/g, '')
    .replace(/gastei|gasto|paguei|pago|comprei|compra|recebi|ganhei|entrei/g, '')
    .replace(/no credito|no debito|no pix|em pix|dinheiro|cartao|credito|debito/g, '')
    .replace(/hoje|ontem|anteontem|semana passada|semana anterior|mes passado|mes anterior|dia/g, '')
    .replace(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return /^(no|na|de|do|da|em|com)$/.test(descricao) ? '' : descricao;
}

function parsearMensagem(mensagem) {
  const texto = normalizar(mensagem);

  const cadastroParcelamento = parsearCadastroParcelamento(texto);
  if (cadastroParcelamento) return cadastroParcelamento;

  const edicaoCartao = parsearEdicaoCartao(texto);
  if (edicaoCartao) return edicaoCartao;

  const exclusaoCartao = parsearExclusaoCartao(texto);
  if (exclusaoCartao) return exclusaoCartao;

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
    cartao,
    dataLancamento: extrairDataLancamento(texto)
  };
}

module.exports = { parsearMensagem, CATEGORIAS };
