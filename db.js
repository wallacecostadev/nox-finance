const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'nox-finance.db');

// Promisificar sqlite3
function openDB() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Inicializar banco
async function initDB() {
  const db = await openDB();

  await run(db, `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_id TEXT UNIQUE NOT NULL,
      nome TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      tipo TEXT CHECK(tipo IN ('receita', 'despesa', 'transferencia')) NOT NULL
    )
  `);

  await run(db, `
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

  await run(db, `
    CREATE TABLE IF NOT EXISTS metas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      categoria TEXT,
      valor_maximo DECIMAL(10,2),
      periodo TEXT DEFAULT 'mensal',
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  // Categorias padrão
  const categorias = [
    ['mercado', 'despesa'], ['alimentacao', 'despesa'], ['ifood', 'despesa'],
    ['uber', 'despesa'], ['transporte', 'despesa'], ['luz', 'despesa'],
    ['agua', 'despesa'], ['internet', 'despesa'], ['contas', 'despesa'],
    ['salario', 'receita'], ['freelance', 'receita'], ['extra', 'receita'],
    ['cartao', 'transferencia'], ['credito', 'transferencia'], ['outros', 'despesa'],
    ['lazer', 'despesa'], ['saude', 'despesa'], ['moradia', 'despesa']
  ];

  for (const [nome, tipo] of categorias) {
    await run(db, 'INSERT OR IGNORE INTO categorias (nome, tipo) VALUES (?, ?)', [nome, tipo]);
  }

  return db;
}

module.exports = { initDB, run, get, all };
