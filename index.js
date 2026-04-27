require('dotenv').config();
const express = require('express');
const { initDB } = require('./db');
const { router, setDbInstance } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas
app.use('/api', router);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Nox Finance API rodando!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Iniciar servidor e banco de dados
initDB()
  .then((db) => {
    // Disponibilizar db para as rotas
    setDbInstance(db);

    app.listen(PORT, () => {
      console.log(`
  ╔════════════════════════════════════╗
  ║     NOX FINANCE - WhatsApp Bot     ║
  ║  Servidor rodando na porta ${PORT}   ║
  ╚════════════════════════════════════╝
  `);
    });
  })
  .catch((err) => {
    console.error('Erro ao iniciar banco de dados:', err);
    process.exit(1);
  });
