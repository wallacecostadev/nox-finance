const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'nox-finance.db');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function usarSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function criarSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function runSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDB() {
  if (usarSupabase()) {
    const db = {
      type: 'supabase',
      client: criarSupabaseClient()
    };
    await inserirCategoriasPadraoSupabase(db);
    return db;
  }

  const db = await openDB();

  await runSqlite(db, `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_id TEXT UNIQUE NOT NULL,
      nome TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runSqlite(db, `
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      tipo TEXT CHECK(tipo IN ('receita', 'despesa', 'transferencia')) NOT NULL
    )
  `);

  await runSqlite(db, `
    CREATE TABLE IF NOT EXISTS lancamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      valor DECIMAL(10,2) NOT NULL,
      categoria TEXT NOT NULL,
      descricao TEXT,
      tipo TEXT CHECK(tipo IN ('receita', 'despesa', 'cartao')) NOT NULL,
      data_lancamento DATE NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  await runSqlite(db, `
    CREATE TABLE IF NOT EXISTS cartoes_credito (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      limite DECIMAL(10,2) DEFAULT 0,
      dia_vencimento INTEGER,
      dia_fechamento INTEGER,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, nome)
    )
  `);

  await adicionarColunaSeNaoExistir(db, 'lancamentos', 'forma_pagamento', 'TEXT');
  await adicionarColunaSeNaoExistir(db, 'lancamentos', 'cartao_id', 'INTEGER');
  await adicionarColunaSeNaoExistir(db, 'lancamentos', 'corrigido_em', 'DATETIME');

  await runSqlite(db, `
    CREATE TABLE IF NOT EXISTS metas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      categoria TEXT,
      valor_maximo DECIMAL(10,2),
      periodo TEXT DEFAULT 'mensal',
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  for (const [nome, tipo] of categoriasPadrao()) {
    await runSqlite(db, 'INSERT OR IGNORE INTO categorias (nome, tipo) VALUES (?, ?)', [nome, tipo]);
  }

  return db;
}

function run(db, sql, params = []) {
  if (db.type === 'supabase') return runSupabase(db, sql, params);
  return runSqlite(db, sql, params);
}

function get(db, sql, params = []) {
  if (db.type === 'supabase') return getSupabase(db, sql, params);
  return getSqlite(db, sql, params);
}

function all(db, sql, params = []) {
  if (db.type === 'supabase') return allSupabase(db, sql, params);
  return allSqlite(db, sql, params);
}

async function runSupabase(db, sql, params = []) {
  const client = db.client;
  const normalized = normalizarSql(sql);

  if (normalized.includes('insert into usuarios')) {
    const { data, error } = await client.from('usuarios').insert({ whatsapp_id: params[0], nome: params[1] }).select('id').single();
    if (error) throw error;
    return { lastID: data.id, changes: 1 };
  }

  if (normalized.includes('insert into lancamentos')) {
    const payload = {
      usuario_id: params[0],
      valor: params[1],
      categoria: params[2],
      descricao: params[3],
      tipo: params[4],
      forma_pagamento: params[5],
      cartao_id: params[6],
      data_lancamento: hojeISO()
    };
    const { data, error } = await client.from('lancamentos').insert(payload).select('id').single();
    if (error) throw error;
    return { lastID: data.id, changes: 1 };
  }

  if (normalized.includes('insert into cartoes_credito') && normalized.includes('on conflict')) {
    const payload = {
      usuario_id: params[0],
      nome: params[1],
      limite: params[2],
      dia_vencimento: params[3],
      dia_fechamento: params[4],
      ativo: true
    };
    const { data, error } = await client
      .from('cartoes_credito')
      .upsert(payload, { onConflict: 'usuario_id,nome' })
      .select('id')
      .single();
    if (error) throw error;
    return { lastID: data.id, changes: 1 };
  }

  if (normalized.includes('insert or ignore into cartoes_credito')) {
    const existente = await buscarCartaoPorNome(client, params[0], params[1]);
    if (existente) return { lastID: existente.id, changes: 0 };
    const { data, error } = await client.from('cartoes_credito').insert({ usuario_id: params[0], nome: params[1], limite: 0 }).select('id').single();
    if (error) throw error;
    return { lastID: data.id, changes: 1 };
  }

  if (normalized.includes('update cartoes_credito set ativo = 0')) {
    const { error, count } = await client.from('cartoes_credito').update({ ativo: false }).eq('id', params[0]).eq('usuario_id', params[1]);
    if (error) throw error;
    return { changes: count || 1 };
  }

  if (normalized.includes('update cartoes_credito set')) {
    const update = {};
    let index = 0;
    if (normalized.includes('limite = ?')) update.limite = params[index++];
    if (normalized.includes('dia_vencimento = ?')) update.dia_vencimento = params[index++];
    if (normalized.includes('dia_fechamento = ?')) update.dia_fechamento = params[index++];
    const id = params[index++];
    const usuarioId = params[index++];
    const { error, count } = await client.from('cartoes_credito').update(update).eq('id', id).eq('usuario_id', usuarioId);
    if (error) throw error;
    return { changes: count || 1 };
  }

  if (normalized.includes('update lancamentos set')) {
    const update = {};
    let index = 0;
    if (normalized.includes('valor = ?')) update.valor = params[index++];
    if (normalized.includes('forma_pagamento = ?')) update.forma_pagamento = params[index++];
    if (normalized.includes('tipo = ?')) update.tipo = params[index++];
    if (normalized.includes('cartao_id = ?')) update.cartao_id = params[index++];
    if (normalized.includes('cartao_id = null')) update.cartao_id = null;
    update.corrigido_em = new Date().toISOString();
    const id = params[index++];
    const usuarioId = params[index++];
    const { error, count } = await client.from('lancamentos').update(update).eq('id', id).eq('usuario_id', usuarioId);
    if (error) throw error;
    return { changes: count || 1 };
  }

  if (normalized.includes('delete from lancamentos')) {
    const { error, count } = await client.from('lancamentos').delete().eq('id', params[0]).eq('usuario_id', params[1]);
    if (error) throw error;
    return { changes: count || 1 };
  }

  if (normalized.includes('insert or ignore into categorias')) {
    const { error } = await client.from('categorias').upsert({ nome: params[0], tipo: params[1] }, { onConflict: 'nome' });
    if (error) throw error;
    return { changes: 1 };
  }

  throw new Error(`Consulta Supabase nao suportada em run(): ${sql}`);
}

async function getSupabase(db, sql, params = []) {
  const client = db.client;
  const normalized = normalizarSql(sql);

  if (normalized.includes('select * from usuarios where whatsapp_id')) {
    const { data, error } = await client.from('usuarios').select('*').eq('whatsapp_id', params[0]).maybeSingle();
    if (error) throw error;
    return data;
  }

  if (normalized.includes('from lancamentos') && normalized.includes('sum(case when tipo =')) {
    const rows = await selecionarLancamentos(client, params[0]);
    const receitas = somar(rows.filter(r => r.tipo === 'receita'));
    const despesas = somar(rows.filter(r => r.tipo === 'despesa'));
    return { receitas, despesas };
  }

  if (normalized.includes('select coalesce(sum(valor), 0) as total') && normalized.includes('from lancamentos')) {
    const rows = await selecionarLancamentos(client, params[0], { tipo: params[1] });
    return { total: somar(rows) };
  }

  if (normalized.includes('select * from cartoes_credito') && normalized.includes('lower(nome) like')) {
    return buscarCartaoPorNome(client, params[0], String(params[1]).replace(/%/g, ''));
  }

  if (normalized.includes('select * from cartoes_credito') && normalized.includes('id = ?')) {
    const { data, error } = await client.from('cartoes_credito').select('*').eq('usuario_id', params[0]).eq('id', params[1]).maybeSingle();
    if (error) throw error;
    return data;
  }

  if (normalized.includes('select * from lancamentos') && normalized.includes('order by criado_em desc')) {
    const { data, error } = await client.from('lancamentos').select('*').eq('usuario_id', params[0]).order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  if (normalized.includes('select * from lancamentos') && normalized.includes('id = ?')) {
    const { data, error } = await client.from('lancamentos').select('*').eq('usuario_id', params[0]).eq('id', params[1]).maybeSingle();
    if (error) throw error;
    return data;
  }

  if (normalized.includes('select l.*, c.nome as cartao_nome') && normalized.includes('l.id = ?')) {
    const { data, error } = await client.from('lancamentos').select('*, cartoes_credito(nome)').eq('usuario_id', params[0]).eq('id', params[1]).maybeSingle();
    if (error) throw error;
    return mapLancamentoComCartao(data);
  }

  throw new Error(`Consulta Supabase nao suportada em get(): ${sql}`);
}

async function allSupabase(db, sql, params = []) {
  const client = db.client;
  const normalized = normalizarSql(sql);

  if (normalized.includes('from cartoes_credito c') && normalized.includes('group by c.id')) {
    return listarCartoesComFatura(client, params[0]);
  }

  if (normalized.includes('from cartoes_credito c') && normalized.includes('group by c.id, c.nome')) {
    const filtro = params[1] ? String(params[1]).replace(/%/g, '') : null;
    return listarFaturas(client, params[0], filtro);
  }

  if (normalized.includes('select l.*, c.nome as cartao_nome')) {
    const { data, error } = await client
      .from('lancamentos')
      .select('*, cartoes_credito(nome)')
      .eq('usuario_id', params[0])
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false })
      .limit(params[1] || 10);
    if (error) throw error;
    return (data || []).map(mapLancamentoComCartao);
  }

  if (normalized.includes('select * from cartoes_credito')) {
    const { data, error } = await client.from('cartoes_credito').select('*').eq('usuario_id', params[0]).eq('ativo', true).order('nome');
    if (error) throw error;
    return data || [];
  }

  throw new Error(`Consulta Supabase nao suportada em all(): ${sql}`);
}

async function inserirCategoriasPadraoSupabase(db) {
  const rows = categoriasPadrao().map(([nome, tipo]) => ({ nome, tipo }));
  const { error } = await db.client.from('categorias').upsert(rows, { onConflict: 'nome' });
  if (error && !String(error.message || '').includes('does not exist')) throw error;
}

async function selecionarLancamentos(client, usuarioId, filtro = {}) {
  let query = client.from('lancamentos').select('*').eq('usuario_id', usuarioId);
  if (filtro.tipo) query = query.eq('tipo', filtro.tipo);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function buscarCartaoPorNome(client, usuarioId, nome) {
  const { data, error } = await client
    .from('cartoes_credito')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('ativo', true)
    .ilike('nome', `%${nome}%`)
    .order('nome')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listarCartoesComFatura(client, usuarioId) {
  const { data: cartoes, error } = await client.from('cartoes_credito').select('*').eq('usuario_id', usuarioId).eq('ativo', true).order('nome');
  if (error) throw error;
  const lancamentos = await selecionarLancamentos(client, usuarioId, { tipo: 'cartao' });
  return (cartoes || []).map(c => ({ ...c, fatura: somar(lancamentos.filter(l => l.cartao_id === c.id)) }));
}

async function listarFaturas(client, usuarioId, filtroNome) {
  const cartoes = await listarCartoesComFatura(client, usuarioId);
  return cartoes
    .filter(c => !filtroNome || c.nome.toLowerCase().includes(filtroNome.toLowerCase()))
    .map(c => ({ cartao: c.nome, limite: c.limite, dia_vencimento: c.dia_vencimento, total: c.fatura }));
}

function mapLancamentoComCartao(row) {
  if (!row) return row;
  return {
    ...row,
    cartao_nome: row.cartoes_credito?.nome || null
  };
}

function somar(rows) {
  return rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
}

function normalizarSql(sql) {
  return String(sql).toLowerCase().replace(/\s+/g, ' ').trim();
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function categoriasPadrao() {
  return [
    ['mercado', 'despesa'], ['alimentacao', 'despesa'], ['ifood', 'despesa'],
    ['uber', 'despesa'], ['transporte', 'despesa'], ['luz', 'despesa'],
    ['agua', 'despesa'], ['internet', 'despesa'], ['contas', 'despesa'],
    ['salario', 'receita'], ['freelance', 'receita'], ['extra', 'receita'],
    ['cartao', 'transferencia'], ['credito', 'transferencia'], ['outros', 'despesa'],
    ['lazer', 'despesa'], ['saude', 'despesa'], ['moradia', 'despesa']
  ];
}

async function adicionarColunaSeNaoExistir(db, tabela, coluna, definicao) {
  const colunas = await allSqlite(db, `PRAGMA table_info(${tabela})`);
  const existe = colunas.some(c => c.name === coluna);
  if (!existe) {
    await runSqlite(db, `ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

module.exports = { initDB, run, get, all };
