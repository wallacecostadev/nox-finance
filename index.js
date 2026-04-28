/**
 * Nox Finance - Servidor Principal
 * Integracao com Z-API para WhatsApp
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const XLSX = require('xlsx');
const { initDB } = require('./db');
const { processarMensagem, setDbInstance } = require('./routes');
const { extrairDadosMensais, importarSupabase } = require('./scripts/import-planilha-2026');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuracao Z-API
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo';
const aguardandoPlanilha = new Map();

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

    const { phone, message, audioUrl, documentUrl, fileName, mimeType } = extrairMensagemRecebida(req.body);

    if (!phone || (!message && !audioUrl && !documentUrl)) {
      return res.json({ success: true, ignored: true, reason: 'Evento sem texto para processar' });
    }

    if (message && ehPedidoImportarPlanilha(message)) {
      aguardandoPlanilha.set(phone, Date.now());
      const resposta = 'Pode enviar a planilha agora. Vou importar os lancamentos pagos e os parcelamentos ativos para este numero.';
      await enviarMensagem(phone, resposta);
      return res.json({ success: true, resposta });
    }

    if (documentUrl) {
      if (!ehPlanilha(fileName, mimeType, documentUrl)) {
        return res.json({ success: true, ignored: true, reason: 'Arquivo recebido nao e planilha' });
      }

      await enviarMensagem(phone, 'Recebi a planilha. Vou ler e importar os dados agora.');
      const resposta = await importarPlanilhaRecebida(phone, documentUrl);
      aguardandoPlanilha.delete(phone);
      await enviarMensagem(phone, resposta);
      return res.json({ success: true, resposta });
    }

    let mensagemProcessada = message;
    if (!mensagemProcessada && audioUrl) {
      await enviarMensagem(phone, 'Recebi seu audio. Vou transcrever e registrar aqui.');
      mensagemProcessada = await transcreverAudio(audioUrl, mimeType);
      console.log(`Audio transcrito para ${phone}: ${mensagemProcessada}`);
    }

    // Processa a mensagem e obtem resposta
    const resposta = await processarMensagem(phone, mensagemProcessada);

    // Envia resposta de volta para o WhatsApp
    const respostaFinal = audioUrl
      ? `Transcricao: "${mensagemProcessada}"\n\n${resposta}`
      : resposta;

    await enviarMensagem(phone, respostaFinal);

    res.json({ success: true, resposta: respostaFinal });
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

  const audioUrl =
    body.audio?.audioUrl ||
    body.audioUrl ||
    body.voice?.audioUrl ||
    body.ptt?.audioUrl;

  const mimeType =
    body.audio?.mimeType ||
    body.document?.mimeType ||
    body.file?.mimeType ||
    body.mimeType ||
    'audio/ogg';

  const documentUrl =
    body.document?.documentUrl ||
    body.document?.url ||
    body.file?.url ||
    body.fileUrl ||
    body.documentUrl;

  const fileName =
    body.document?.fileName ||
    body.document?.filename ||
    body.file?.fileName ||
    body.file?.filename ||
    body.fileName ||
    body.filename;

  return {
    phone: phone ? String(phone).replace(/\D/g, '') : null,
    message: message ? String(message).trim() : null,
    audioUrl,
    documentUrl,
    fileName,
    mimeType
  };
}

function ehPedidoImportarPlanilha(message) {
  const texto = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return texto.includes('planilha') && /(importar|usar|atualizar|subir|carregar)/.test(texto);
}

function ehPlanilha(fileName, mimeType, url) {
  const alvo = `${fileName || ''} ${mimeType || ''} ${url || ''}`.toLowerCase();
  return alvo.includes('.xlsx') ||
    alvo.includes('.xls') ||
    alvo.includes('spreadsheet') ||
    alvo.includes('excel');
}

async function importarPlanilhaRecebida(phone, documentUrl) {
  const response = await axios.get(documentUrl, {
    responseType: 'arraybuffer',
    headers: ZAPI_CLIENT_TOKEN ? { 'Client-Token': ZAPI_CLIENT_TOKEN } : undefined
  });

  const workbook = XLSX.read(Buffer.from(response.data), { type: 'buffer' });
  const { lancamentos, parcelamentos } = extrairDadosMensais(workbook);
  const resultado = await importarSupabase(lancamentos, parcelamentos, { whatsappId: phone });

  return `*Planilha importada*

Lancamentos novos: ${resultado.inseridos}
Lancamentos duplicados: ${resultado.ignorados}
Parcelamentos novos: ${resultado.parcelamentosInseridos}
Parcelamentos duplicados: ${resultado.parcelamentosIgnorados}

Agora voce pode consultar: "saldo", "extrato do mes", "fatura" ou "parcelamentos".`;
}

async function transcreverAudio(audioUrl, mimeType = 'audio/ogg') {
  const provider = GROQ_API_KEY ? 'groq' : 'openai';

  if (provider === 'openai' && !OPENAI_API_KEY) {
    throw new Error('Configure GROQ_API_KEY ou OPENAI_API_KEY para transcrever audio');
  }

  const audioResponse = await axios.get(audioUrl, {
    responseType: 'arraybuffer',
    headers: ZAPI_CLIENT_TOKEN ? { 'Client-Token': ZAPI_CLIENT_TOKEN } : undefined
  });

  const audioBuffer = Buffer.from(audioResponse.data);
  const form = new FormData();
  const filename = getNomeArquivoAudio(mimeType);

  form.append('file', new Blob([audioBuffer], { type: mimeType }), filename);
  form.append('model', provider === 'groq' ? GROQ_TRANSCRIPTION_MODEL : TRANSCRIPTION_MODEL);
  form.append('language', 'pt');
  form.append('prompt', 'Transcreva comandos financeiros em portugues do Brasil, preservando valores, formas de pagamento, nomes de cartoes e categorias.');

  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';

  const apiKey = provider === 'groq' ? GROQ_API_KEY : OPENAI_API_KEY;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Erro ao transcrever audio com ${provider}: ${data.error?.message || response.statusText}`);
  }

  return String(data.text || '').trim();
}

function getNomeArquivoAudio(mimeType) {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio.mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio.m4a';
  if (mimeType.includes('wav')) return 'audio.wav';
  if (mimeType.includes('webm')) return 'audio.webm';
  return 'audio.ogg';
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
