/**
 * Nox Finance - Servidor Principal
 * Integracao com Z-API para WhatsApp
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { initDB } = require('./db');
const { processarMensagem, setDbInstance } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuracao Z-API
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'online', service: 'nox-finance' });
});

// Webhook - recebe mensagens do WhatsApp (via Z-API ou teste manual)
app.post('/webhook', async (req, res) => {
  try {
    console.log('Mensagem recebida:', JSON.stringify(req.body, null, 2));

    if (req.body.fromMe) {
      return res.json({ success: true, ignored: true, reason: 'Mensagem enviada pelo proprio numero' });
    }

    const { phone, message } = extrairMensagemRecebida(req.body);

    if (!phone || !message) {
      return res.json({ success: true, ignored: true, reason: 'Evento sem texto para processar' });
    }

    // Processa a mensagem e obtem resposta
    const resposta = await processarMensagem(phone, message);

    // Envia resposta de volta para o WhatsApp
    await enviarMensagem(phone, resposta);

    res.json({ success: true, resposta });
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

// Rota para envio manual (teste via API)
app.post('/enviar', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone e message so obrigatorios' });
    }

    await enviarMensagem(phone, message);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao enviar:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

function extrairMensagemRecebida(body) {
  const phone =
    body.phone ||
    body.from ||
    body.sender ||
    (body.remoteJid ? String(body.remoteJid).split('@')[0] : null);

  const message =
    (typeof body.message === 'string' ? body.message : null) ||
    body.body ||
    body.text?.message ||
    body.text ||
    body.caption;

  return {
    phone: phone ? String(phone).replace(/\D/g, '') : null,
    message: message ? String(message).trim() : null
  };
}

// Funcao para enviar mensagem via Z-API
async function enviarMensagem(phone, text) {
  try {
    if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
      throw new Error('ZAPI_INSTANCE e ZAPI_TOKEN precisam estar configurados');
    }

    console.log(`Enviando para ${phone}: ${text}`);

    const headers = {
      'Content-Type': 'application/json'
    };

    if (ZAPI_CLIENT_TOKEN) {
      headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
    }

    const response = await axios.post(
      `${ZAPI_BASE_URL}/send-text`,
      {
        phone: phone.replace(/\D/g, ''), // Remove caracteres nao numericos
        message: text
      },
      { headers }
    );

    console.log(`Mensagem enviada para ${phone}`);
    return response.data;
  } catch (error) {
    console.error(`Erro ao enviar mensagem para ${phone}:`, error.message);
    throw error;
  }
}

// Inicializa banco de dados e servidor
async function start() {
  try {
    // Inicializa banco de dados
    const db = await initDB();
    setDbInstance(db);
    console.log('Banco de dados inicializado');

    // Inicia servidor HTTP
    app.listen(PORT, () => {
      console.log(`
      NOX FINANCE - WhatsApp Bot
      Servidor rodando na porta ${PORT}
      Z-API Instance: ${ZAPI_INSTANCE}
      `);
    });
  } catch (error) {
    console.error('Erro ao iniciar:', error);
    process.exit(1);
  }
}

start();
