require('dotenv').config();

const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const MESES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MES_NUMERO = Object.fromEntries(MESES.map((mes, index) => [mes, index + 1]));
const PLANILHA_PADRAO = 'C:/Users/walla/Downloads/Planilha_Financeira_2026.xlsx';

const args = new Set(process.argv.slice(2));
const aplicar = args.has('--apply');
const incluirNaoPagos = args.has('--include-unpaid');
const whatsappId = process.env.IMPORT_WHATSAPP_ID || process.env.DEFAULT_WHATSAPP_ID || '5521981675587';
const arquivo = process.argv.find(arg => /\.xlsx?$/i.test(arg)) || PLANILHA_PADRAO;

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function valorMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return valor;

  let texto = String(valor).trim();
  const negativo = texto.includes('-');
  texto = texto.replace(/R\$/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!texto) return 0;
  if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/,/g, '');
  else if (texto.includes(',')) texto = texto.replace(',', '.');

  const numero = Number(texto.replace(/(?!^)-/g, ''));
  if (!Number.isFinite(numero)) return 0;
  return negativo ? -Math.abs(numero) : numero;
}

function temValor(valor) {
  return Math.abs(valorMoeda(valor)) > 0.0001;
}

function dataISO(valor, mesNumero) {
  if (!valor) return `2026-${String(mesNumero).padStart(2, '0')}-01`;

  const texto = String(valor).trim();
  const match = texto.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (match) {
    const ano = match[3] ? normalizarAno(match[3]) : 2026;
    return `${ano}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  }

  return `2026-${String(mesNumero).padStart(2, '0')}-01`;
}

function dataISOMesPlanilha(valor, mesNumero) {
  const texto = String(valor || '').trim();
  const match = texto.match(/^(\d{1,2})(?:[\/.-]\d{1,2})?(?:[\/.-](\d{2,4}))?$/);
  if (!match) return `2026-${String(mesNumero).padStart(2, '0')}-01`;

  const ano = match[2] ? normalizarAno(match[2]) : 2026;
  return `${ano}-${String(mesNumero).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
}

function normalizarAno(ano) {
  const valor = Number(ano);
  return valor < 100 ? 2000 + valor : valor;
}

function formaPagamento(valor) {
  const texto = normalizar(valor);
  if (texto.includes('pix')) return 'pix';
  if (texto.includes('debito')) return 'debito';
  if (texto.includes('credito') || texto.includes('cartao')) return 'credito';
  if (texto.includes('dinheiro')) return 'dinheiro';
  return 'nao_informado';
}

function tipoLancamento(forma) {
  return forma === 'credito' ? 'cartao' : 'despesa';
}

function nomeCartao(valor) {
  const texto = normalizar(valor);
  const match = texto.match(/credito\s+(.+)/i);
  return match ? formatarNome(match[1]) : null;
}

function formatarNome(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, letra => letra.toUpperCase());
}

function categoriaBot(categoria) {
  const texto = normalizar(categoria);
  if (texto.includes('mercado')) return 'alimentacao';
  if (texto.includes('ifood') || texto.includes('restaurante')) return 'alimentacao';
  if (texto.includes('uber') || texto.includes('transporte') || texto.includes('gasolina')) return 'transporte';
  if (texto.includes('saude') || texto.includes('farmacia')) return 'saude';
  if (texto.includes('aluguel') || texto.includes('moradia')) return 'moradia';
  if (texto.includes('conta') || texto.includes('internet') || texto.includes('luz') || texto.includes('agua')) return 'contas';
  if (texto.includes('lazer')) return 'lazer';
  if (texto.includes('salario') || texto.includes('receita')) return 'receita';
  return texto || 'outros';
}

function getSheetMes(workbook, mes) {
  return workbook.SheetNames.find(nome => normalizar(nome) === normalizar(mes));
}

function encontrarGruposLancamento(header) {
  const grupos = [];

  for (let coluna = 0; coluna < header.length; coluna += 1) {
    if (normalizar(header[coluna]) !== 'nome') continue;

    const grupo = { nome: coluna, pago: null, data: null, tipo: null, categoria: null, valor: null };
    for (let k = coluna + 1; k <= Math.min(coluna + 7, header.length - 1); k += 1) {
      const nome = normalizar(header[k]);
      if (nome === 'pago?') grupo.pago = k;
      if (nome === 'data') grupo.data = k;
      if (nome === 'tipo') grupo.tipo = k;
      if (nome === 'categoria') grupo.categoria = k;
      if (nome === 'valor') grupo.valor = k;
    }

    if (grupo.data !== null && grupo.tipo !== null && grupo.categoria !== null && grupo.valor !== null) grupos.push(grupo);
  }

  return grupos;
}

function linhaVazia(row, grupo) {
  return [grupo.nome, grupo.data, grupo.tipo, grupo.categoria, grupo.valor]
    .every(coluna => row[coluna] === null || row[coluna] === undefined || String(row[coluna]).trim() === '');
}

function extrairInfoParcelamento(descricao) {
  const match = String(descricao || '').match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!match) return null;

  const atual = Number(match[1]);
  const total = Number(match[2]);
  if (!atual || !total || atual > total) return null;
  return { atual, total };
}

function adicionarMeses(dataISOValor, meses) {
  const [ano, mes, dia] = String(dataISOValor).slice(0, 10).split('-').map(Number);
  const data = new Date(ano, mes - 1 + meses, 1);
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  data.setDate(Math.min(dia || 1, ultimoDia));
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, '0'),
    String(data.getDate()).padStart(2, '0')
  ].join('-');
}

function classificarParcelamento(descricao, categoria) {
  const texto = `${normalizar(descricao)} ${normalizar(categoria)}`;
  return texto.includes('emprestimo') || texto.includes('acordo') || texto.includes('parc. fatura') || texto.includes('fatura')
    ? 'divida'
    : 'compra';
}

function criarParcelamento({ mes, linhaIndex, linha, grupo, mesNumero }) {
  const descricao = String(linha[grupo.nome] || '').trim();
  const info = extrairInfoParcelamento(descricao);
  if (!info) return null;

  const valor = Math.abs(valorMoeda(linha[grupo.valor]));
  if (!valor) return null;

  const pago = grupo.pago === null ? true : String(linha[grupo.pago]).toUpperCase() === 'TRUE';
  const dataAtual = dataISOMesPlanilha(linha[grupo.data], mesNumero);
  const dataInicio = adicionarMeses(dataAtual, -(info.atual - 1));
  const dataFim = adicionarMeses(dataInicio, info.total - 1);
  const forma = formaPagamento(linha[grupo.tipo]);
  const parcelasPagas = Math.max(0, Math.min(info.total, pago ? info.atual : info.atual - 1));

  return {
    mes,
    linha: linhaIndex + 1,
    tipo: classificarParcelamento(descricao, linha[grupo.categoria]),
    descricao,
    valor_parcela: valor,
    total_parcelas: info.total,
    parcelas_pagas: parcelasPagas,
    forma_pagamento: forma,
    cartao: nomeCartao(linha[grupo.tipo]),
    categoria: categoriaBot(linha[grupo.categoria]),
    data_inicio: dataInicio,
    data_fim: dataFim,
    status: parcelasPagas >= info.total ? 'quitado' : 'ativo'
  };
}

function extrairDadosMensais(workbook) {
  const lancamentos = [];
  const parcelamentos = [];

  for (const mes of MESES) {
    const sheetName = getSheetMes(workbook, mes);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    const mesNumero = MES_NUMERO[mes];

    for (let r = 0; r < linhas.length; r += 1) {
      const header = linhas[r] || [];
      const grupos = encontrarGruposLancamento(header);

      for (const grupo of grupos) {
        for (let linhaIndex = r + 1; linhaIndex < linhas.length; linhaIndex += 1) {
          const linha = linhas[linhaIndex] || [];
          const proxima = linhas[linhaIndex + 1] || [];

          if (linhaVazia(linha, grupo)) {
            if (linhaVazia(proxima, grupo)) break;
            continue;
          }

          const descricao = String(linha[grupo.nome] || '').trim();
          const valor = Math.abs(valorMoeda(linha[grupo.valor]));
          if (!descricao || !valor) continue;

          const parcelamento = criarParcelamento({ mes, linhaIndex, linha, grupo, mesNumero });
          if (parcelamento && parcelamento.status === 'ativo') parcelamentos.push(parcelamento);

          const pago = grupo.pago === null ? true : String(linha[grupo.pago]).toUpperCase() === 'TRUE';
          if (!pago && !incluirNaoPagos) continue;

          const forma = formaPagamento(linha[grupo.tipo]);
          lancamentos.push({
            mes,
            linha: linhaIndex + 1,
            tipo: tipoLancamento(forma),
            valor,
            categoria: categoriaBot(linha[grupo.categoria]),
            descricao,
            forma_pagamento: forma,
            cartao: nomeCartao(linha[grupo.tipo]),
            data_lancamento: dataISOMesPlanilha(linha[grupo.data], mesNumero),
            origem: pago ? 'planilha' : 'planilha-nao-pago'
          });
        }
      }

      const entradaColuna = header.findIndex(celula => normalizar(celula) === 'entradas');
      if (entradaColuna >= 0) {
        for (let linhaIndex = r + 1; linhaIndex < linhas.length; linhaIndex += 1) {
          const linha = linhas[linhaIndex] || [];
          const descricao = String(linha[entradaColuna] || '').trim();
          if (!descricao) continue;
          if (normalizar(descricao) === 'total:') break;

          const valor = Math.abs(valorMoeda(linha[entradaColuna + 1]));
          if (!valor) continue;

          lancamentos.push({
            mes,
            linha: linhaIndex + 1,
            tipo: 'receita',
            valor,
            categoria: 'receita',
            descricao,
            forma_pagamento: 'entrada',
            cartao: null,
            data_lancamento: `2026-${String(mesNumero).padStart(2, '0')}-01`,
            origem: 'planilha'
          });
        }
      }
    }
  }

  return { lancamentos, parcelamentos: consolidarParcelamentos(parcelamentos) };
}

function consolidarParcelamentos(parcelamentos) {
  const porChave = new Map();

  for (const item of parcelamentos) {
    const chave = [
      normalizar(item.descricao).replace(/\b\d{1,2}\/(\d{1,2})\b/g, 'x/$1'),
      Number(item.valor_parcela || 0).toFixed(2),
      item.total_parcelas,
      item.cartao || ''
    ].join('|');
    const existente = porChave.get(chave);

    if (!existente || Number(item.parcelas_pagas || 0) > Number(existente.parcelas_pagas || 0)) {
      porChave.set(chave, {
        ...item,
        descricao: item.descricao.replace(/\b\d{1,2}\/\d{1,2}\b/g, '').replace(/\s+/g, ' ').trim()
      });
    }
  }

  return [...porChave.values()].filter(item => item.status === 'ativo');
}

function resumir(lancamentos) {
  const resumo = {};
  for (const item of lancamentos) {
    resumo[item.mes] ||= { qtd: 0, receitas: 0, despesas: 0, cartao: 0, totalGastos: 0 };
    resumo[item.mes].qtd += 1;
    if (item.tipo === 'receita') resumo[item.mes].receitas += item.valor;
    if (item.tipo === 'despesa') resumo[item.mes].despesas += item.valor;
    if (item.tipo === 'cartao') resumo[item.mes].cartao += item.valor;
    resumo[item.mes].totalGastos = resumo[item.mes].despesas + resumo[item.mes].cartao;
  }
  return Object.entries(resumo).map(([mes, valores]) => ({
    mes,
    qtd: valores.qtd,
    receitas: arredondar(valores.receitas),
    despesas: arredondar(valores.despesas),
    cartao: arredondar(valores.cartao),
    totalGastos: arredondar(valores.totalGastos)
  }));
}

function resumirParcelamentos(parcelamentos) {
  const resumo = {};
  for (const item of parcelamentos) {
    resumo[item.mes] ||= { qtd: 0, compras: 0, dividas: 0, restante: 0 };
    resumo[item.mes].qtd += 1;
    if (item.tipo === 'divida') resumo[item.mes].dividas += 1;
    else resumo[item.mes].compras += 1;
    resumo[item.mes].restante += item.valor_parcela * Math.max(0, item.total_parcelas - item.parcelas_pagas);
  }
  return Object.entries(resumo).map(([mes, valores]) => ({
    mes,
    qtd: valores.qtd,
    compras: valores.compras,
    dividas: valores.dividas,
    restante: arredondar(valores.restante)
  }));
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

async function obterUsuario(client) {
  const { data: existente, error: erroBusca } = await client.from('usuarios').select('*').eq('whatsapp_id', whatsappId).maybeSingle();
  if (erroBusca) throw erroBusca;
  if (existente) return existente;

  const { data, error } = await client.from('usuarios').insert({ whatsapp_id: whatsappId, nome: 'Wallace' }).select('*').single();
  if (error) throw error;
  return data;
}

async function obterCartoes(client, usuarioId, lancamentos, parcelamentos) {
  const cartoes = new Map();
  const nomes = [...new Set([
    ...lancamentos.map(l => l.cartao).filter(Boolean),
    ...parcelamentos.map(p => p.cartao).filter(Boolean)
  ])];

  for (const nome of nomes) {
    const { data, error } = await client
      .from('cartoes_credito')
      .upsert({ usuario_id: usuarioId, nome, limite: 0, ativo: true }, { onConflict: 'usuario_id,nome' })
      .select('*')
      .single();
    if (error) throw error;
    if (data) cartoes.set(nome, data.id);
  }

  return cartoes;
}

async function importarSupabase(lancamentos, parcelamentos) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_KEY para importar.');
  }

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const usuario = await obterUsuario(client);
  const cartoes = await obterCartoes(client, usuario.id, lancamentos, parcelamentos);

  const { data: existentes, error: erroExistentes } = await client
    .from('lancamentos')
    .select('id,valor,descricao,tipo,data_lancamento,forma_pagamento')
    .eq('usuario_id', usuario.id);
  if (erroExistentes) throw erroExistentes;

  const chavesExistentes = new Set((existentes || []).map(chaveLancamento));
  const novos = lancamentos
    .filter(l => !chavesExistentes.has(chaveLancamento(l)))
    .map(l => ({
      usuario_id: usuario.id,
      valor: l.valor,
      categoria: l.categoria,
      descricao: l.descricao,
      tipo: l.tipo,
      data_lancamento: l.data_lancamento,
      forma_pagamento: l.forma_pagamento,
      cartao_id: l.cartao ? cartoes.get(l.cartao) || null : null
    }));

  if (novos.length > 0) {
    const { error } = await client.from('lancamentos').insert(novos);
    if (error) throw error;
  }

  const { data: existentesParcelamentos, error: erroParcelamentos } = await client
    .from('parcelamentos')
    .select('id,descricao,valor_parcela,total_parcelas,data_inicio')
    .eq('usuario_id', usuario.id);
  if (erroParcelamentos) throw erroParcelamentos;

  const chavesParcelamentos = new Set((existentesParcelamentos || []).map(chaveParcelamento));
  const novosParcelamentos = parcelamentos
    .filter(p => !chavesParcelamentos.has(chaveParcelamento(p)))
    .map(p => ({
      usuario_id: usuario.id,
      descricao: p.descricao,
      tipo: p.tipo,
      valor_parcela: p.valor_parcela,
      total_parcelas: p.total_parcelas,
      parcelas_pagas: p.parcelas_pagas,
      forma_pagamento: p.forma_pagamento,
      cartao_id: p.cartao ? cartoes.get(p.cartao) || null : null,
      categoria: p.categoria,
      data_inicio: p.data_inicio,
      data_fim: p.data_fim,
      status: p.status
    }));

  if (novosParcelamentos.length > 0) {
    const { error } = await client.from('parcelamentos').insert(novosParcelamentos);
    if (error) throw error;
  }

  return {
    inseridos: novos.length,
    ignorados: lancamentos.length - novos.length,
    parcelamentosInseridos: novosParcelamentos.length,
    parcelamentosIgnorados: parcelamentos.length - novosParcelamentos.length
  };
}

function chaveLancamento(lancamento) {
  return [
    String(lancamento.data_lancamento).slice(0, 10),
    lancamento.tipo,
    lancamento.forma_pagamento || '',
    Number(lancamento.valor || 0).toFixed(2),
    normalizar(lancamento.descricao)
  ].join('|');
}

function chaveParcelamento(parcelamento) {
  return [
    String(parcelamento.data_inicio).slice(0, 10),
    Number(parcelamento.valor_parcela || 0).toFixed(2),
    Number(parcelamento.total_parcelas || 0),
    normalizar(parcelamento.descricao)
  ].join('|');
}

async function main() {
  const caminho = path.resolve(arquivo);
  const workbook = XLSX.readFile(caminho);
  const { lancamentos, parcelamentos } = extrairDadosMensais(workbook);

  console.log(`Arquivo: ${caminho}`);
  console.log(`Modo: ${aplicar ? 'IMPORTAR NO SUPABASE' : 'PREVIA, nada sera importado'}`);
  console.log(`Lancamentos nao pagos: ${incluirNaoPagos ? 'incluidos' : 'ignorados'}`);
  console.log(`Total de lancamentos lidos: ${lancamentos.length}`);
  console.table(resumir(lancamentos));
  console.log('\nParcelamentos ativos encontrados:');
  console.log(`Total de parcelamentos: ${parcelamentos.length}`);
  console.table(resumirParcelamentos(parcelamentos));
  console.log('Amostra de lancamentos:');
  console.log(JSON.stringify(lancamentos.slice(0, 10), null, 2));
  console.log('Amostra de parcelamentos:');
  console.log(JSON.stringify(parcelamentos.slice(0, 10), null, 2));

  if (!aplicar) {
    console.log('\nPara importar: node scripts/import-planilha-2026.js --apply');
    return;
  }

  const resultado = await importarSupabase(lancamentos, parcelamentos);
  console.log(`Importacao concluida. Lancamentos inseridos: ${resultado.inseridos}. Lancamentos duplicados: ${resultado.ignorados}. Parcelamentos inseridos: ${resultado.parcelamentosInseridos}. Parcelamentos duplicados: ${resultado.parcelamentosIgnorados}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
