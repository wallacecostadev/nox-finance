const { get, run, all } = require('./db');
const { parsearMensagem } = require('./parser');

let dbInstance = null;

function setDbInstance(db) {
  dbInstance = db;
}

function getDb() {
  return dbInstance;
}

async function processarMensagem(whatsappId, mensagem) {
  const db = getDb();
  if (!db) throw new Error('Banco de dados nao inicializado');

  const usuario = await obterOuCriarUsuario(db, whatsappId);
  const userId = usuario.id;
  const parsed = parsearMensagem(mensagem);

  if (parsed.tipo === 'desconhecido') {
    return `*Nox Finance*

Nao entendi sua mensagem. Tente:
"recebi 500 do salario"
"gastei 150 no mercado no pix"
"gastei 80 no credito nubank"
"saldo atual"
"extrato"
"ajuda"`;
  }

  if (parsed.tipo === 'ajuda') return getTextoAjuda();
  if (parsed.tipo === 'saldo') return responderSaldo(userId);
  if (parsed.tipo === 'extrato') return responderExtrato(userId);
  if (parsed.tipo === 'fatura') return responderFatura(userId, parsed.cartao);
  if (parsed.tipo === 'listar_cartoes') return responderCartoes(userId);
  if (parsed.tipo === 'cadastrar_cartao') return cadastrarCartao(userId, parsed);
  if (parsed.tipo === 'corrigir') return corrigirLancamento(userId, parsed);
  if (parsed.tipo === 'excluir') return excluirLancamento(userId, parsed);

  if (parsed.tipo === 'consulta') {
    if (parsed.o === 'gastos') {
      const total = await getTotalPorTipo(userId, 'despesa');
      return `*Gastos no periodo*

Total: ${formatarMoeda(total)}`;
    }

    if (parsed.o === 'receitas') {
      const total = await getTotalPorTipo(userId, 'receita');
      return `*Receitas no periodo*

Total: ${formatarMoeda(total)}`;
    }
  }

  if (parsed.tipo === 'receita' || parsed.tipo === 'despesa' || parsed.tipo === 'cartao') {
    return registrarLancamento(userId, parsed);
  }

  return 'Comando nao reconhecido. Digite "ajuda" para ver os comandos.';
}

async function obterOuCriarUsuario(db, whatsappId) {
  let usuario = await get(db, 'SELECT * FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
  if (!usuario) {
    await run(db, 'INSERT INTO usuarios (whatsapp_id, nome) VALUES (?, ?)', [whatsappId, 'Usuario']);
    usuario = await get(db, 'SELECT * FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
  }
  return usuario;
}

function getTextoAjuda() {
  return `*Nox Finance - Comandos*

*Receitas*
"recebi 500 do salario"
"ganhei 1000 de freelance"

*Despesas com forma de pagamento*
"gastei 150 no mercado no pix"
"paguei 80 de luz no debito"
"comprei 40 no dinheiro"

*Cartao de credito*
"cadastrar cartao Nubank limite 4000 vencimento 10"
"gastei 120 no credito Nubank no mercado"
"fatura"
"fatura Nubank"
"cartoes"

*Consultas*
"saldo atual"
"extrato"
"quanto gastei no mes?"

*Correcao manual*
"corrigir ultimo valor 95"
"corrigir 12 valor 95"
"corrigir 12 pix"
"apagar ultimo"
"apagar 12"`;
}

async function registrarLancamento(userId, parsed) {
  if (!parsed.valor) {
    return 'Nao entendi o valor. Tente: "gastei 150 no mercado no pix"';
  }

  let cartaoId = null;
  if (parsed.tipo === 'cartao') {
    const cartao = await obterCartaoParaLancamento(userId, parsed.cartao);
    cartaoId = cartao ? cartao.id : null;
  }

  const resultado = await run(getDb(), `
    INSERT INTO lancamentos (
      usuario_id, valor, categoria, descricao, tipo, forma_pagamento, cartao_id, data_lancamento
    ) VALUES (?, ?, ?, ?, ?, ?, ?, date("now"))
  `, [
    userId,
    parsed.valor,
    parsed.categoria,
    parsed.descricao,
    parsed.tipo,
    parsed.formaPagamento,
    cartaoId
  ]);

  const detalheCartao = cartaoId ? `\nCartao: ${(await getCartaoPorId(userId, cartaoId)).nome}` : '';

  return `*Lancamento registrado!*

ID: ${resultado.lastID}
Tipo: ${nomeTipo(parsed.tipo)}
Valor: ${formatarMoeda(parsed.valor)}
Categoria: ${parsed.categoria}
Pagamento: ${nomeForma(parsed.formaPagamento)}${detalheCartao}
Descricao: ${parsed.descricao}`;
}

async function cadastrarCartao(userId, parsed) {
  const nome = formatarNomeCartao(parsed.nome);

  await run(getDb(), `
    INSERT INTO cartoes_credito (usuario_id, nome, limite, dia_vencimento, dia_fechamento)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(usuario_id, nome) DO UPDATE SET
      limite = excluded.limite,
      dia_vencimento = excluded.dia_vencimento,
      dia_fechamento = excluded.dia_fechamento,
      ativo = 1
  `, [userId, nome, parsed.limite || 0, parsed.vencimento || null, parsed.fechamento || null]);

  return `*Cartao cadastrado!*

Cartao: ${nome}
Limite: ${formatarMoeda(parsed.limite || 0)}
Vencimento: dia ${parsed.vencimento || 'nao informado'}
Fechamento: dia ${parsed.fechamento || 'nao informado'}`;
}

async function responderCartoes(userId) {
  const cartoes = await all(getDb(), `
    SELECT c.*,
      COALESCE(SUM(CASE WHEN l.tipo = 'cartao' THEN l.valor ELSE 0 END), 0) as fatura
    FROM cartoes_credito c
    LEFT JOIN lancamentos l ON l.cartao_id = c.id
    WHERE c.usuario_id = ? AND c.ativo = 1
    GROUP BY c.id
    ORDER BY c.nome
  `, [userId]);

  if (cartoes.length === 0) {
    return 'Nenhum cartao cadastrado ainda. Exemplo: "cadastrar cartao Nubank limite 4000 vencimento 10"';
  }

  const texto = cartoes.map(c => {
    const disponivel = Number(c.limite || 0) - Number(c.fatura || 0);
    return `${c.nome}: fatura ${formatarMoeda(c.fatura)}, limite ${formatarMoeda(c.limite || 0)}, disponivel ${formatarMoeda(disponivel)}, vence dia ${c.dia_vencimento || '-'}`;
  }).join('\n');

  return `*Meus cartoes*\n\n${texto}`;
}

async function responderFatura(userId, nomeCartao) {
  const params = [userId];
  let filtroCartao = '';

  if (nomeCartao) {
    filtroCartao = 'AND lower(c.nome) LIKE ?';
    params.push(`%${nomeCartao.toLowerCase()}%`);
  }

  const rows = await all(getDb(), `
    SELECT
      COALESCE(c.nome, 'Sem cartao') as cartao,
      COALESCE(c.limite, 0) as limite,
      c.dia_vencimento,
      COALESCE(SUM(l.valor), 0) as total
    FROM lancamentos l
    LEFT JOIN cartoes_credito c ON c.id = l.cartao_id
    WHERE l.usuario_id = ? AND l.tipo = 'cartao' ${filtroCartao}
    GROUP BY c.id, c.nome, c.limite, c.dia_vencimento
    ORDER BY c.nome
  `, params);

  if (rows.length === 0) {
    return nomeCartao
      ? `Nao encontrei fatura para o cartao "${nomeCartao}".`
      : 'Nenhum gasto em cartao de credito encontrado.';
  }

  const texto = rows.map(r => {
    const disponivel = Number(r.limite || 0) - Number(r.total || 0);
    return `${r.cartao}: ${formatarMoeda(r.total)} | limite ${formatarMoeda(r.limite || 0)} | disponivel ${formatarMoeda(disponivel)} | vence dia ${r.dia_vencimento || '-'}`;
  }).join('\n');

  const total = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
  return `*Fatura de cartao*

${texto}

Total: ${formatarMoeda(total)}`;
}

async function corrigirLancamento(userId, parsed) {
  const lancamento = await obterLancamentoAlvo(userId, parsed);
  if (!lancamento) {
    return 'Nao encontrei esse lancamento. Use "extrato" para ver os IDs.';
  }

  const updates = [];
  const params = [];

  if (parsed.valor) {
    updates.push('valor = ?');
    params.push(parsed.valor);
  }

  if (parsed.formaPagamento) {
    const tipo = parsed.formaPagamento === 'credito' ? 'cartao' : 'despesa';
    updates.push('forma_pagamento = ?', 'tipo = ?');
    params.push(parsed.formaPagamento, tipo);

    if (parsed.formaPagamento === 'credito') {
      const cartao = await obterCartaoParaLancamento(userId, parsed.cartao);
      updates.push('cartao_id = ?');
      params.push(cartao ? cartao.id : null);
    } else {
      updates.push('cartao_id = NULL');
    }
  }

  if (updates.length === 0) {
    return 'Diga o que quer corrigir. Exemplo: "corrigir 12 valor 95" ou "corrigir 12 pix".';
  }

  updates.push('corrigido_em = CURRENT_TIMESTAMP');
  params.push(lancamento.id, userId);

  await run(getDb(), `
    UPDATE lancamentos
    SET ${updates.join(', ')}
    WHERE id = ? AND usuario_id = ?
  `, params);

  const atualizado = await getLancamentoComCartao(userId, lancamento.id);
  return `*Lancamento corrigido!*

ID: ${atualizado.id}
Tipo: ${nomeTipo(atualizado.tipo)}
Valor: ${formatarMoeda(atualizado.valor)}
Pagamento: ${nomeForma(atualizado.forma_pagamento)}
Descricao: ${atualizado.descricao}`;
}

async function excluirLancamento(userId, parsed) {
  const lancamento = await obterLancamentoAlvo(userId, parsed);
  if (!lancamento) {
    return 'Nao encontrei esse lancamento. Use "extrato" para ver os IDs.';
  }

  await run(getDb(), 'DELETE FROM lancamentos WHERE id = ? AND usuario_id = ?', [lancamento.id, userId]);
  return `Lancamento ${lancamento.id} apagado: ${formatarMoeda(lancamento.valor)} - ${lancamento.descricao}`;
}

async function responderSaldo(userId) {
  const saldo = await getSaldo(userId);
  const fatura = await getTotalPorTipo(userId, 'cartao');

  return `*Saldo Atual*

Receitas: ${formatarMoeda(saldo.receitas)}
Despesas pagas: ${formatarMoeda(saldo.despesas)}
Fatura cartao: ${formatarMoeda(fatura)}
*Saldo sem cartao: ${formatarMoeda(saldo.saldo)}*`;
}

async function responderExtrato(userId) {
  const extrato = await getExtrato(userId);
  if (extrato.length === 0) return 'Nenhum lancamento encontrado.';

  const texto = extrato.map(l => {
    const sinal = l.tipo === 'receita' ? '+' : '-';
    const cartao = l.cartao_nome ? ` | ${l.cartao_nome}` : '';
    return `#${l.id} ${sinal} ${formatarMoeda(l.valor)} | ${nomeForma(l.forma_pagamento)}${cartao} | ${l.descricao}`;
  }).join('\n');

  return `*Ultimos lancamentos*\n\n${texto}`;
}

async function getSaldo(userId) {
  const result = await get(getDb(), `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) as receitas,
      COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0) as despesas
    FROM lancamentos
    WHERE usuario_id = ?
  `, [userId]);

  return {
    receitas: Number(result.receitas || 0),
    despesas: Number(result.despesas || 0),
    saldo: Number(result.receitas || 0) - Number(result.despesas || 0)
  };
}

async function getExtrato(userId, limite = 10) {
  return all(getDb(), `
    SELECT l.*, c.nome as cartao_nome
    FROM lancamentos l
    LEFT JOIN cartoes_credito c ON c.id = l.cartao_id
    WHERE l.usuario_id = ?
    ORDER BY l.criado_em DESC, l.id DESC
    LIMIT ?
  `, [userId, limite]);
}

async function getTotalPorTipo(userId, tipo) {
  const result = await get(getDb(), `
    SELECT COALESCE(SUM(valor), 0) as total
    FROM lancamentos
    WHERE usuario_id = ? AND tipo = ?
  `, [userId, tipo]);
  return Number(result.total || 0);
}

async function obterCartaoParaLancamento(userId, nomeCartao) {
  if (nomeCartao) {
    const existente = await get(getDb(), `
      SELECT * FROM cartoes_credito
      WHERE usuario_id = ? AND lower(nome) LIKE ? AND ativo = 1
      ORDER BY nome
      LIMIT 1
    `, [userId, `%${nomeCartao.toLowerCase()}%`]);

    if (existente) return existente;

    const nome = formatarNomeCartao(nomeCartao);
    const criado = await run(getDb(), `
      INSERT OR IGNORE INTO cartoes_credito (usuario_id, nome, limite)
      VALUES (?, ?, 0)
    `, [userId, nome]);

    if (criado.lastID) return getCartaoPorId(userId, criado.lastID);
  }

  const cartoes = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [userId]);
  return cartoes.length === 1 ? cartoes[0] : null;
}

async function getCartaoPorId(userId, cartaoId) {
  return get(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND id = ?', [userId, cartaoId]);
}

async function obterLancamentoAlvo(userId, parsed) {
  if (parsed.alvo === 'ultimo') {
    return get(getDb(), `
      SELECT * FROM lancamentos
      WHERE usuario_id = ?
      ORDER BY criado_em DESC, id DESC
      LIMIT 1
    `, [userId]);
  }

  if (!parsed.id) return null;
  return get(getDb(), 'SELECT * FROM lancamentos WHERE usuario_id = ? AND id = ?', [userId, parsed.id]);
}

async function getLancamentoComCartao(userId, id) {
  return get(getDb(), `
    SELECT l.*, c.nome as cartao_nome
    FROM lancamentos l
    LEFT JOIN cartoes_credito c ON c.id = l.cartao_id
    WHERE l.usuario_id = ? AND l.id = ?
  `, [userId, id]);
}

function formatarMoeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2)}`;
}

function formatarNomeCartao(nome) {
  return String(nome || 'cartao')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, letra => letra.toUpperCase());
}

function nomeTipo(tipo) {
  if (tipo === 'receita') return 'receita';
  if (tipo === 'cartao') return 'cartao de credito';
  return 'despesa';
}

function nomeForma(forma) {
  const nomes = {
    pix: 'pix',
    debito: 'debito',
    credito: 'credito',
    dinheiro: 'dinheiro',
    entrada: 'entrada',
    nao_informado: 'nao informado'
  };
  return nomes[forma] || 'nao informado';
}

const express = require('express');
const router = express.Router();

router.post('/webhook', async (req, res) => {
  const { remoteJid, body } = req.body;

  if (!remoteJid || !body) {
    return res.status(400).json({ error: 'Dados invalidos' });
  }

  const whatsappId = remoteJid.split('@')[0];
  const mensagem = body.trim();

  try {
    const resposta = await processarMensagem(whatsappId, mensagem);
    res.json({ success: true, resposta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

module.exports = { router, processarMensagem, setDbInstance };
