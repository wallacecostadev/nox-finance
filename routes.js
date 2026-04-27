const { get, run, all } = require('./db');
const { parsearMensagem } = require('./parser');

let dbInstance = null;

function setDbInstance(db) {
  dbInstance = db;
}

function getDb() {
  return dbInstance;
}

/**
 * Processa a mensagem e retorna resposta
 */
async function processarMensagem(whatsappId, mensagem) {
  const db = getDb();
  if (!db) throw new Error('Banco de dados não inicializado');

  // Verifica se usuário existe, cria se não existir
  let usuario = await get(db, 'SELECT * FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
  if (!usuario) {
    await run(db, 'INSERT INTO usuarios (whatsapp_id, nome) VALUES (?, ?)', [whatsappId, 'Usuário']);
    usuario = await get(db, 'SELECT * FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
  }

  const userId = usuario.id;
  const parsed = parsearMensagem(mensagem);

  // Respostas baseadas no tipo
  if (parsed.tipo === 'desconhecido') {
    return `*Nox Finance* 🤖

Não entendi sua mensagem. Tente:
💰 "recebi 500 do salario"
💸 "gastei 150 no mercado"
📊 "saldo atual"
📋 "extrato da semana"
❓ "ajuda"`;
  }

  if (parsed.tipo === 'ajuda') {
    return `*Nox Finance - Comandos* 🤖

💰 *Receitas:*
"recebi 500 do salario"
"ganhei 1000 de freelance"

💸 *Despesas:*
"gastei 150 no mercado"
"paguei 200 de luz"

📊 *Consultas:*
"saldo atual"
"quanto gastei no mês?"
"extrato da semana"
"cartão de crédito"

🏷️ *Categorias:*
mercado, ifood → Alimentação
luz, agua, internet → Contas
uber, gasolina → Transporte
salario, freelance → Receita`;
  }

  if (parsed.tipo === 'saldo') {
    const saldo = await getSaldo(userId);
    return `*Saldo Atual* 💰

Receitas: R$ ${saldo.receitas.toFixed(2)}
Despesas: R$ ${saldo.despesas.toFixed(2)}
*Saldo: R$ ${saldo.saldo.toFixed(2)}*`;
  }

  if (parsed.tipo === 'extrato') {
    const extrato = await getExtrato(userId);
    if (extrato.length === 0) {
      return 'Nenhum lançamento encontrado.';
    }
    const texto = extrato.map(l => `${l.tipo === 'receita' ? '➕' : '➖'} R$ ${l.valor.toFixed(2)} - ${l.descricao}`).join('\n');
    return `*Últimos Lançamentos*\n\n${texto}`;
  }

  if (parsed.tipo === 'cartao') {
    const totalCartao = await getCartao(userId);
    return `*Cartão de Crédito* 💳

Fatura atual: R$ ${totalCartao.toFixed(2)}`;
  }

  if (parsed.tipo === 'consulta') {
    if (parsed.o === 'gastos') {
      const total = await getTotalPorTipo(userId, 'despesa');
      return `*Gastos no período* 💸

Total: R$ ${total.toFixed(2)}`;
    }
    if (parsed.o === 'receitas') {
      const total = await getTotalPorTipo(userId, 'receita');
      return `*Receitas no período* 💰

Total: R$ ${total.toFixed(2)}`;
    }
  }

  // Lançamento
  if (parsed.tipo === 'receita' || parsed.tipo === 'despesa' || parsed.tipo === 'cartao') {
    if (!parsed.valor) {
      return 'Não entendi o valor. Tente: "gastei 150 no mercado"';
    }

    const tipoDb = parsed.tipo === 'cartao' ? 'cartao' : parsed.tipo;
    await run(db,
      'INSERT INTO lancamentos (usuario_id, valor, categoria, descricao, tipo, data_lancamento) VALUES (?, ?, ?, ?, ?, date("now"))',
      [userId, parsed.valor, parsed.categoria, parsed.descricao, tipoDb]
    );

    return `*Lançamento registrado!* ✅

${parsed.tipo === 'receita' ? '➕' : '➖'} R$ ${parsed.valor.toFixed(2)}
Categoria: ${parsed.categoria}
Descrição: ${parsed.descricao}`;
  }

  return 'Comando não reconhecido. Digite "ajuda" para ver os comandos.';
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
    receitas: result.receitas || 0,
    despesas: result.despesas || 0,
    saldo: (result.receitas || 0) - (result.despesas || 0)
  };
}

async function getExtrato(userId, limite = 10) {
  return all(getDb(), `
    SELECT * FROM lancamentos
    WHERE usuario_id = ?
    ORDER BY criado_em DESC
    LIMIT ?
  `, [userId, limite]);
}

async function getCartao(userId) {
  const result = await get(getDb(), `
    SELECT COALESCE(SUM(valor), 0) as total
    FROM lancamentos
    WHERE usuario_id = ? AND tipo = 'cartao'
  `, [userId]);
  return result.total || 0;
}

async function getTotalPorTipo(userId, tipo) {
  const result = await get(getDb(), `
    SELECT COALESCE(SUM(valor), 0) as total
    FROM lancamentos
    WHERE usuario_id = ? AND tipo = ?
  `, [userId, tipo]);
  return result.total || 0;
}

// Router Express
const express = require('express');
const router = express.Router();

/**
 * Webhook da Evolution API
 */
router.post('/webhook', async (req, res) => {
  const { remoteJid, body } = req.body;

  if (!remoteJid || !body) {
    return res.status(400).json({ error: 'Dados inválidos' });
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
