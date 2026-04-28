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

Nao entendi sua mensagem ainda.

Tente um destes exemplos:
"recebi 500 do salario"
"gastei 150 no mercado no pix"
"gastei 80 no credito nubank"
"gastei 60 no mercado ontem"
"saldo atual"
"extrato"
"ajuda"`;
  }

  if (parsed.tipo === 'ajuda') return getTextoAjuda();
  if (parsed.tipo === 'saldo') return responderSaldo(userId, parsed.periodo);
  if (parsed.tipo === 'extrato') return responderExtrato(userId, parsed.periodo);
  if (parsed.tipo === 'fatura') return responderFatura(userId, parsed.cartao, parsed.periodo);
  if (parsed.tipo === 'detalhe_fatura') return responderDetalheFatura(userId, parsed.cartao, parsed.periodo);
  if (parsed.tipo === 'listar_cartoes') return responderCartoes(userId, parsed.periodo);
  if (parsed.tipo === 'cadastrar_cartao') return cadastrarCartao(userId, parsed);
  if (parsed.tipo === 'editar_cartao') return editarCartao(userId, parsed);
  if (parsed.tipo === 'excluir_cartao') return excluirCartao(userId, parsed);
  if (parsed.tipo === 'cadastrar_parcelamento') return cadastrarParcelamento(userId, parsed);
  if (parsed.tipo === 'listar_parcelamentos') return responderParcelamentos(userId, parsed.filtro);
  if (parsed.tipo === 'corrigir') return corrigirLancamento(userId, parsed);
  if (parsed.tipo === 'excluir') return excluirLancamento(userId, parsed);

  if (parsed.tipo === 'consulta') {
    if (parsed.o === 'gastos') {
      const intervalo = resolverIntervalo(parsed.periodo);
      const total = await getTotalPorTipo(userId, 'despesa', intervalo);
      return `💸 *Gastos - ${intervalo.rotulo}*

• Total: ${formatarMoeda(total)}`;
    }

    if (parsed.o === 'receitas') {
      const intervalo = resolverIntervalo(parsed.periodo);
      const total = await getTotalPorTipo(userId, 'receita', intervalo);
      return `💰 *Receitas - ${intervalo.rotulo}*

• Total: ${formatarMoeda(total)}`;
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
"gastei 60 no mercado ontem"
"gastei 120 no ifood dia 15/03"

*Cartao de credito*
"cadastrar cartao Nubank limite 4000 vencimento 10"
"gastei 120 no credito Nubank no mercado"
"fatura"
"fatura Nubank"
"detalhe cartao Nubank"
"extrato cartao Nubank"
"cartoes"
"editar cartao Nubank limite 5000"
"alterar vencimento do cartao Nubank para 15"
"excluir cartao Nubank"

*Parcelamentos e dividas*
"comprei perfume de 500 no cartao Nubank parcelado em 4x"
"comprei celular parcelado em 10x de 120 no credito Nubank"
"cadastre emprestimo de 1000 em 8 vezes"
"cadastre divida em 6 parcelas de 300"
"parcelamentos"
"compras parceladas"
"dividas"

*Consultas*
"saldo atual"
"extrato"
"quanto gastei no mes?"
"extrato mes passado"
"gastos de ontem"
"receitas de marco 2026"

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
    if (!cartao) return respostaCartaoNaoEncontrado(userId, parsed.cartao);
    cartaoId = cartao ? cartao.id : null;
  }

  const resultado = await run(getDb(), `
    INSERT INTO lancamentos (
      usuario_id, valor, categoria, descricao, tipo, forma_pagamento, cartao_id, data_lancamento
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    parsed.valor,
    parsed.categoria,
    parsed.descricao,
    parsed.tipo,
    parsed.formaPagamento,
    cartaoId,
    parsed.dataLancamento || dataHojeISO()
  ]);

  const detalheCartao = cartaoId ? `\nCartao: ${(await getCartaoPorId(userId, cartaoId)).nome}` : '';

  return `✅ *Lancamento registrado*

• ID: #${resultado.lastID}
• Tipo: ${nomeTipo(parsed.tipo)}
• Valor: ${formatarMoeda(parsed.valor)}
• Data: ${formatarDataBR(parsed.dataLancamento || dataHojeISO())}
• Categoria: ${parsed.categoria}
• Pagamento: ${nomeForma(parsed.formaPagamento)}${detalheCartao}
• Descricao: ${parsed.descricao}`;
}

async function cadastrarCartao(userId, parsed) {
  const nome = formatarNomeCartao(parsed.nome);
  if (!nome || nome.toLowerCase() === 'cartao') {
    return 'Qual o nome do cartão? Exemplo: "cartão Inter limite 2000 vencimento 10".';
  }

  const existente = await obterCartaoPorNomeExato(userId, nome);
  if (existente) {
    const updates = [];
    const params = [];

    if (parsed.limite !== null && parsed.limite !== undefined) {
      updates.push('limite = ?');
      params.push(parsed.limite);
    }

    if (parsed.vencimento !== null && parsed.vencimento !== undefined) {
      updates.push('dia_vencimento = ?');
      params.push(parsed.vencimento);
    }

    if (parsed.fechamento !== null && parsed.fechamento !== undefined) {
      updates.push('dia_fechamento = ?');
      params.push(parsed.fechamento);
    }

    if (updates.length > 0) {
      params.push(existente.id, userId);
      await run(getDb(), `UPDATE cartoes_credito SET ${updates.join(', ')}, ativo = 1 WHERE id = ? AND usuario_id = ?`, params);
    }

    const atualizado = await getCartaoPorId(userId, existente.id);
    return `💳 *Cartão atualizado*

• Cartão: ${atualizado.nome}
• Limite: ${formatarMoeda(atualizado.limite || 0)}
• Vencimento: dia ${atualizado.dia_vencimento || 'não informado'}
• Fechamento: dia ${atualizado.dia_fechamento || 'não informado'}`;
  }

  await run(getDb(), `
    INSERT INTO cartoes_credito (usuario_id, nome, limite, dia_vencimento, dia_fechamento)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(usuario_id, nome) DO UPDATE SET
      limite = excluded.limite,
      dia_vencimento = excluded.dia_vencimento,
      dia_fechamento = excluded.dia_fechamento,
      ativo = 1
  `, [userId, nome, parsed.limite ?? 0, parsed.vencimento || null, parsed.fechamento || null]);

  return `💳 *Cartão cadastrado*

• Cartão: ${nome}
• Limite: ${formatarMoeda(parsed.limite ?? 0)}
• Vencimento: dia ${parsed.vencimento || 'não informado'}
• Fechamento: dia ${parsed.fechamento || 'não informado'}`;
}

async function editarCartao(userId, parsed) {
  if (!parsed.id && !parsed.nome) {
    return 'Qual cartão você quer editar? Exemplo: "editar cartão n5 limite 5000" ou "editar cartão Nubank limite 5000".';
  }

  const cartao = await obterCartaoAlvo(userId, parsed);
  if (!cartao) {
    return `Não encontrei esse cartão. Use "cartões" para ver a lista com os IDs.`;
  }

  const updates = [];
  const params = [];

  if (parsed.novoNome) {
    const novoNome = formatarNomeCartao(parsed.novoNome);
    const existente = await obterCartaoPorNomeExato(userId, novoNome);
    if (existente && Number(existente.id) !== Number(cartao.id)) {
      return `Ja existe um cartao chamado "${existente.nome}". Use "cartoes" para ver os IDs e evitar confusao.`;
    }

    updates.push('nome = ?');
    params.push(novoNome);
  }

  if (parsed.limite !== null && parsed.limite !== undefined) {
    updates.push('limite = ?');
    params.push(parsed.limite);
  }

  if (parsed.vencimento !== null && parsed.vencimento !== undefined) {
    updates.push('dia_vencimento = ?');
    params.push(parsed.vencimento);
  }

  if (parsed.fechamento !== null && parsed.fechamento !== undefined) {
    updates.push('dia_fechamento = ?');
    params.push(parsed.fechamento);
  }

  if (updates.length === 0) {
    return 'Diga o que quer editar. Exemplo: "editar cartão n5 limite 5000 vencimento 15".';
  }

  params.push(cartao.id, userId);
  await run(getDb(), `UPDATE cartoes_credito SET ${updates.join(', ')} WHERE id = ? AND usuario_id = ?`, params);

  const atualizado = await getCartaoPorId(userId, cartao.id);
  return `💳 *Cartão atualizado*

• Nº: ${formatarIdCartao(atualizado.id)}
• Cartão: ${atualizado.nome}
• Limite: ${formatarMoeda(atualizado.limite || 0)}
• Vencimento: dia ${atualizado.dia_vencimento || 'não informado'}
• Fechamento: dia ${atualizado.dia_fechamento || 'não informado'}`;
}

async function excluirCartao(userId, parsed) {
  if (!parsed.id && !parsed.nome) {
    return 'Qual cartão você quer excluir? Exemplo: "excluir cartão n5" ou "excluir cartão Nubank". Use "cartões" para ver os números.';
  }

  const cartao = await obterCartaoAlvo(userId, parsed);
  if (!cartao) {
    return `Não encontrei esse cartão. Use "cartões" para ver a lista com os IDs.`;
  }

  await run(getDb(), 'UPDATE cartoes_credito SET ativo = 0 WHERE id = ? AND usuario_id = ?', [cartao.id, userId]);
  return `🗑️ *Cartão removido*

• Nº: ${formatarIdCartao(cartao.id)}
• Cartão: ${cartao.nome}
• Histórico: os lançamentos antigos continuam no extrato.`;
}
async function cadastrarParcelamento(userId, parsed) {
  if (!parsed.valorParcela || !parsed.totalParcelas) {
    return 'Nao entendi o parcelamento. Exemplo: "comprei celular parcelado em 10x de 120 no credito Nubank"';
  }

  let cartaoId = null;
  if (parsed.formaPagamento === 'credito') {
    const cartao = await obterCartaoParaLancamento(userId, parsed.cartao);
    if (!cartao) return respostaCartaoNaoEncontrado(userId, parsed.cartao);
    cartaoId = cartao ? cartao.id : null;
  }

  const parcelasPagas = Math.min(Number(parsed.parcelasPagas || 0), Number(parsed.totalParcelas));
  const dataInicio = parsed.dataInicio || dataHojeISO();
  const dataFim = adicionarMesesISO(dataInicio, Number(parsed.totalParcelas) - 1);
  const status = parcelasPagas >= Number(parsed.totalParcelas) ? 'quitado' : 'ativo';
  const restante = calcularRestanteParcelamento(parsed, parcelasPagas);

  const resultado = await run(getDb(), `
    INSERT INTO parcelamentos (
      usuario_id, descricao, tipo, valor_parcela, total_parcelas, parcelas_pagas,
      forma_pagamento, cartao_id, categoria, data_inicio, data_fim, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    parsed.descricao,
    parsed.tipoParcelamento || 'compra',
    parsed.valorParcela,
    parsed.totalParcelas,
    parcelasPagas,
    parsed.formaPagamento || 'nao_informado',
    cartaoId,
    parsed.categoria || 'outros',
    dataInicio,
    dataFim,
    status
  ]);

  let parcelasNaFatura = 0;
  if (cartaoId) {
    parcelasNaFatura = await lancarParcelasNoCartao(userId, parsed, cartaoId, dataInicio);
  }

  const detalheFatura = parcelasNaFatura
    ? `\n• Fatura: ${parcelasNaFatura} parcela(s) lancada(s) no cartao`
    : '';

  return `📌 *Parcelamento cadastrado*

• ID: #${resultado.lastID}
• Tipo: ${parsed.tipoParcelamento === 'divida' ? 'divida' : 'compra'}
• Descricao: ${parsed.descricao}
• Parcela: ${formatarMoeda(parsed.valorParcela)}
${parsed.valorTotal ? `• Total: ${formatarMoeda(parsed.valorTotal)}\n` : ''}• Progresso: ${parcelasPagas}/${parsed.totalParcelas}
• Restante: ${formatarMoeda(restante)}
• Termina em: ${formatarDataBR(dataFim)}${detalheFatura}`;
}

async function lancarParcelasNoCartao(userId, parsed, cartaoId, dataInicio) {
  const totalParcelas = Number(parsed.totalParcelas || 0);
  for (let i = 0; i < totalParcelas; i += 1) {
    await run(getDb(), `
      INSERT INTO lancamentos (
        usuario_id, valor, categoria, descricao, tipo, forma_pagamento, cartao_id, data_lancamento
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      parsed.valorParcela,
      parsed.categoria || 'outros',
      `${parsed.descricao} (${i + 1}/${totalParcelas})`,
      'cartao',
      'credito',
      cartaoId,
      adicionarMesesISO(dataInicio, i)
    ]);
  }

  return totalParcelas;
}

function calcularRestanteParcelamento(parsed, parcelasPagas) {
  const totalParcelas = Number(parsed.totalParcelas || 0);
  const restantes = Math.max(0, totalParcelas - Number(parcelasPagas || 0));
  if (parsed.valorTotal && totalParcelas > 0) {
    return Math.round((Number(parsed.valorTotal) * (restantes / totalParcelas)) * 100) / 100;
  }

  return Number(parsed.valorParcela || 0) * restantes;
}

async function responderParcelamentos(userId, filtro) {
  const rows = await listarParcelamentos(userId, filtro);

  if (rows.length === 0) {
    if (filtro === 'divida') return 'Nenhuma divida parcelada ativa encontrada.';
    if (filtro === 'compra') return 'Nenhuma compra parcelada ativa encontrada.';
    return 'Nenhum parcelamento ativo encontrado.';
  }

  const totalRestante = rows.reduce((sum, p) => sum + valorRestanteParcelamento(p), 0);
  const blocos = rows.slice(0, 12).map(p => {
    const restantes = parcelasRestantes(p);
    const cartao = p.cartao_nome ? `\n• Cartao: ${p.cartao_nome}` : '';
    return `#${p.id} ${p.tipo === 'divida' ? 'Divida' : 'Compra'} - ${p.descricao}
• Parcela: ${formatarMoeda(p.valor_parcela)}
• Progresso: ${Number(p.parcelas_pagas || 0)}/${p.total_parcelas}
• Faltam: ${restantes} parcela(s)
• Restante: ${formatarMoeda(valorRestanteParcelamento(p))}
• Termina em: ${formatarDataBR(p.data_fim)}${cartao}`;
  }).join('\n\n');

  const titulo = filtro === 'divida'
    ? 'Dividas parceladas'
    : filtro === 'compra'
      ? 'Compras parceladas'
      : 'Parcelamentos ativos';
  return `📌 *${titulo}*

${blocos}

*Resumo*
• Itens ativos: ${rows.length}
• Total restante: ${formatarMoeda(totalRestante)}`;
}

async function responderCartoes(userId, periodo) {
  const intervalo = resolverIntervalo(periodo);
  const cartoesBase = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [userId]);
  const lancamentosCartao = await listarLancamentos(userId, intervalo, { tipo: 'cartao' });
  const cartoes = cartoesBase.map(c => ({
    ...c,
    fatura: lancamentosCartao
      .filter(l => Number(l.cartao_id || 0) === Number(c.id))
      .reduce((sum, l) => sum + Number(l.valor || 0), 0)
  }));

  if (cartoes.length === 0) {
    return 'Nenhum cartao cadastrado ainda. Exemplo: "cadastrar cartao Nubank limite 4000 vencimento 10"';
  }

  const totalFatura = cartoes.reduce((sum, c) => sum + Number(c.fatura || 0), 0);
  const totalLimite = cartoes.reduce((sum, c) => sum + Number(c.limite || 0), 0);
  const blocos = cartoes.map(c => {
    const limite = Number(c.limite || 0);
    const fatura = Number(c.fatura || 0);
    const disponivel = limite - fatura;
    const uso = limite > 0 ? Math.round((fatura / limite) * 100) : 0;

    return `💳 *${formatarIdCartao(c.id)} - ${c.nome}*\n• Fatura: ${formatarMoeda(fatura)}\n• Limite: ${formatarMoeda(limite)}\n• Disponível: ${formatarMoeda(disponivel)}\n• Uso: ${uso}%\n• Vencimento: dia ${c.dia_vencimento || '-'}\n• Fechamento: dia ${c.dia_fechamento || '-'}`;
  }).join('\n\n');

  return `💳 *Meus cartões - ${intervalo.rotulo}*\n\n${blocos}\n\n📌 *Resumo*\n• Fatura total: ${formatarMoeda(totalFatura)}\n• Limite total: ${formatarMoeda(totalLimite)}\n• Disponível total: ${formatarMoeda(totalLimite - totalFatura)}\n\nPara apagar: "excluir cartão n1"\nPara editar: "editar cartão n1 limite 3000"\nPor áudio, também pode falar: "cartão número 1".`;
}

async function responderFatura(userId, nomeCartao, periodo) {
  const intervalo = resolverIntervalo(periodo);
  const cartoes = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [userId]);
  const lancamentosCartao = await listarLancamentos(userId, intervalo, { tipo: 'cartao' });
  const rows = cartoes
    .filter(c => !nomeCartao || c.nome.toLowerCase().includes(nomeCartao.toLowerCase()))
    .map(c => ({
      cartao: c.nome,
      limite: c.limite,
      dia_vencimento: c.dia_vencimento,
      total: lancamentosCartao
        .filter(l => Number(l.cartao_id || 0) === Number(c.id))
        .reduce((sum, l) => sum + Number(l.valor || 0), 0)
    }));

  if (rows.length === 0) {
    return nomeCartao
      ? `Nao encontrei fatura para o cartao "${nomeCartao}".`
      : 'Nenhum cartao cadastrado ainda. Exemplo: "cadastrar cartao Nubank limite 4000 vencimento 10"';
  }

  const texto = rows.map(r => {
    const disponivel = Number(r.limite || 0) - Number(r.total || 0);
    return `💳 *${r.cartao}*\n• Fatura: ${formatarMoeda(r.total)}\n• Limite: ${formatarMoeda(r.limite || 0)}\n• Disponivel: ${formatarMoeda(disponivel)}\n• Vence: dia ${r.dia_vencimento || '-'}`;
  }).join('\n');

  const total = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
  return `💳 *Fatura - ${intervalo.rotulo}*

${texto}

📌 Total: ${formatarMoeda(total)}

Para ver as compras de um cartao, envie:
"detalhe cartao Nubank"`;
}

async function responderDetalheFatura(userId, nomeCartao, periodo) {
  const intervalo = resolverIntervalo(periodo);
  const cartoes = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [userId]);
  const cartoesFiltrados = filtrarCartoesPorNome(cartoes, nomeCartao);

  if (cartoes.length === 0) {
    return 'Nenhum cartao cadastrado ainda. Exemplo: "cadastrar cartao Nubank limite 4000 vencimento 10"';
  }

  if (nomeCartao && cartoesFiltrados.length === 0) {
    return `Nao encontrei o cartao "${nomeCartao}". Envie "cartoes" para ver os nomes e IDs.`;
  }

  const lancamentos = await listarLancamentos(userId, intervalo, { tipo: 'cartao' });
  const ids = new Set(cartoesFiltrados.map(c => Number(c.id)));
  const filtrados = lancamentos.filter(l => ids.has(Number(l.cartao_id || 0)));

  if (filtrados.length === 0) {
    const alvo = nomeCartao ? ` do cartao ${formatarNomeCartao(nomeCartao)}` : '';
    return `Nenhuma compra${alvo} encontrada em ${intervalo.rotulo}.`;
  }

  const grupos = cartoesFiltrados
    .map(cartao => ({
      cartao,
      itens: filtrados.filter(l => Number(l.cartao_id || 0) === Number(cartao.id))
    }))
    .filter(g => g.itens.length > 0);

  const blocos = grupos.map(g => {
    const total = g.itens.reduce((sum, l) => sum + Number(l.valor || 0), 0);
    const linhas = g.itens.slice(0, 12).map(l => {
      return `#${l.id} ${formatarDataBR(l.data_lancamento)} | ${formatarMoeda(l.valor)} | ${l.categoria} | ${l.descricao}`;
    }).join('\n');

    return `*${formatarIdCartao(g.cartao.id)} - ${g.cartao.nome}*\nTotal: ${formatarMoeda(total)}\n${linhas}`;
  }).join('\n\n');

  const totalGeral = filtrados.reduce((sum, l) => sum + Number(l.valor || 0), 0);
  const avisoLimite = filtrados.length > 12 ? '\n\nMostrei os lancamentos mais recentes. Use "extrato" para ver mais detalhes gerais.' : '';

  return `*Detalhe da fatura - ${intervalo.rotulo}*

${blocos}

*Total geral:* ${formatarMoeda(totalGeral)}${avisoLimite}`;
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
  return `✅ *Lancamento corrigido*

• ID: #${atualizado.id}
• Tipo: ${nomeTipo(atualizado.tipo)}
• Valor: ${formatarMoeda(atualizado.valor)}
• Pagamento: ${nomeForma(atualizado.forma_pagamento)}
• Descricao: ${atualizado.descricao}`;
}

async function excluirLancamento(userId, parsed) {
  const lancamento = await obterLancamentoAlvo(userId, parsed);
  if (!lancamento) {
    return 'Nao encontrei esse lancamento. Use "extrato" para ver os IDs.';
  }

  await run(getDb(), 'DELETE FROM lancamentos WHERE id = ? AND usuario_id = ?', [lancamento.id, userId]);
  return `🗑️ *Lancamento apagado*

• ID: #${lancamento.id}
• Valor: ${formatarMoeda(lancamento.valor)}
• Descricao: ${lancamento.descricao}`;
}

async function responderSaldo(userId, periodo) {
  const intervalo = resolverIntervalo(periodo);
  const saldo = await getSaldo(userId, intervalo);
  const fatura = await getTotalPorTipo(userId, 'cartao', intervalo);

  return `📊 *Saldo - ${intervalo.rotulo}*

• Receitas: ${formatarMoeda(saldo.receitas)}
• Despesas pagas: ${formatarMoeda(saldo.despesas)}
• Fatura cartao: ${formatarMoeda(fatura)}

💰 *Saldo sem cartao: ${formatarMoeda(saldo.saldo)}*`;
}

async function responderExtrato(userId, periodo) {
  const intervalo = resolverIntervalo(periodo);
  const extrato = await getExtrato(userId, 20, intervalo);
  if (extrato.length === 0) return `Nenhum lancamento encontrado em ${intervalo.rotulo}.`;

  const texto = extrato.map(l => {
    const sinal = l.tipo === 'receita' ? '+' : '-';
    const cartao = l.cartao_nome ? ` | ${l.cartao_nome}` : '';
    return `#${l.id} ${sinal} ${formatarMoeda(l.valor)} | ${formatarDataBR(l.data_lancamento)} | ${nomeForma(l.forma_pagamento)}${cartao} | ${l.descricao}`;
  }).join('\n');

  return `📋 *Extrato - ${intervalo.rotulo}*\n\n${texto}`;
}

async function getSaldo(userId, intervalo) {
  const lancamentos = await listarLancamentos(userId, intervalo);
  const receitas = lancamentos.filter(l => l.tipo === 'receita').reduce((sum, l) => sum + Number(l.valor || 0), 0);
  const despesas = lancamentos.filter(l => l.tipo === 'despesa').reduce((sum, l) => sum + Number(l.valor || 0), 0);

  return {
    receitas,
    despesas,
    saldo: receitas - despesas
  };
}

async function getExtrato(userId, limite = 10, intervalo) {
  const lancamentos = await listarLancamentos(userId, intervalo);
  return lancamentos.slice(0, limite);
}

async function getTotalPorTipo(userId, tipo, intervalo) {
  const lancamentos = await listarLancamentos(userId, intervalo, { tipo });
  return lancamentos.reduce((sum, l) => sum + Number(l.valor || 0), 0);
}

async function listarLancamentos(userId, intervalo, filtros = {}) {
  const rows = await all(getDb(), `
    SELECT l.*, c.nome as cartao_nome
    FROM lancamentos l
    LEFT JOIN cartoes_credito c ON c.id = l.cartao_id
    WHERE l.usuario_id = ?
    ORDER BY l.criado_em DESC, l.id DESC
    LIMIT ?
  `, [userId, 1000]);

  return rows.filter(l => {
    if (filtros.tipo && l.tipo !== filtros.tipo) return false;
    return estaNoIntervalo(l.data_lancamento || l.criado_em, intervalo);
  });
}

async function listarParcelamentos(userId, filtro) {
  const rows = await all(getDb(), `
    SELECT p.*, c.nome as cartao_nome
    FROM parcelamentos p
    LEFT JOIN cartoes_credito c ON c.id = p.cartao_id
    WHERE p.usuario_id = ? AND p.status = 'ativo'
    ORDER BY p.data_fim ASC, p.id ASC
  `, [userId]);

  return rows.filter(p => {
    if (filtro && p.tipo !== filtro) return false;
    return parcelasRestantes(p) > 0;
  });
}

function parcelasRestantes(parcelamento) {
  return Math.max(0, Number(parcelamento.total_parcelas || 0) - Number(parcelamento.parcelas_pagas || 0));
}

function valorRestanteParcelamento(parcelamento) {
  return Number(parcelamento.valor_parcela || 0) * parcelasRestantes(parcelamento);
}

async function obterCartaoParaLancamento(userId, nomeCartao) {
  const cartoes = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [userId]);

  if (nomeCartao) {
    const encontrados = filtrarCartoesPorNome(cartoes, nomeCartao);
    return encontrados.length === 1 ? encontrados[0] : null;
  }

  return cartoes.length === 1 ? cartoes[0] : null;
}

async function respostaCartaoNaoEncontrado(userId, nomeCartao) {
  const cartoes = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [userId]);
  if (cartoes.length === 0) {
    return 'Antes de lancar no credito, cadastre um cartao. Exemplo: "cadastrar cartao Inter limite 2000 vencimento 10".';
  }

  const lista = cartoes.slice(0, 8).map(c => `${formatarIdCartao(c.id)} - ${c.nome}`).join('\n');
  if (nomeCartao) {
    return `Nao encontrei o cartao "${formatarNomeCartao(nomeCartao)}".\n\nUse um destes nomes:\n${lista}\n\nExemplo: "compra de 300 no cartao ${cartoes[0].nome} com comida".`;
  }

  return `Em qual cartao foi essa compra?\n\n${lista}\n\nExemplo: "compra de 300 no cartao ${cartoes[0].nome} com comida".`;
}

function filtrarCartoesPorNome(cartoes, nomeCartao) {
  if (!nomeCartao) return cartoes;
  const alvo = normalizarTexto(nomeCartao);
  const exatos = cartoes.filter(c => normalizarTexto(c.nome) === alvo);
  if (exatos.length > 0) return exatos;

  return cartoes.filter(c => {
    const nome = normalizarTexto(c.nome);
    return nome.includes(alvo) || alvo.includes(nome);
  });
}

async function getCartaoPorId(userId, cartaoId) {
  return get(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? AND id = ?', [userId, cartaoId]);
}

async function obterCartaoPorNome(userId, nomeCartao) {
  return get(getDb(), `
    SELECT * FROM cartoes_credito
    WHERE usuario_id = ? AND lower(nome) LIKE ? AND ativo = 1
    ORDER BY nome
    LIMIT 1
  `, [userId, `%${String(nomeCartao).toLowerCase()}%`]);
}

async function obterCartaoAlvo(userId, parsed) {
  if (parsed.id) {
    const porId = await getCartaoPorId(userId, parsed.id);
    if (porId && Number(porId.ativo) !== 0 && porId.ativo !== false) return porId;
  }

  if (parsed.nome) {
    return obterCartaoPorNome(userId, parsed.nome);
  }

  return null;
}

async function obterCartaoPorNomeExato(userId, nomeCartao) {
  const cartoes = await all(getDb(), 'SELECT * FROM cartoes_credito WHERE usuario_id = ? ORDER BY nome', [userId]);
  return cartoes.find(c => String(c.nome || '').toLowerCase() === String(nomeCartao || '').toLowerCase()) || null;
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

function resolverIntervalo(periodo) {
  const hoje = inicioDoDia(new Date());
  const tipo = periodo?.tipo || 'mes';

  if (tipo === 'hoje') return criarIntervalo(hoje, hoje, 'hoje');
  if (tipo === 'ontem') return criarIntervalo(adicionarDias(hoje, -1), adicionarDias(hoje, -1), 'ontem');
  if (tipo === 'anteontem') return criarIntervalo(adicionarDias(hoje, -2), adicionarDias(hoje, -2), 'anteontem');

  if (tipo === 'semana' || tipo === 'semana_passada') {
    const inicio = inicioDaSemana(hoje);
    const start = tipo === 'semana_passada' ? adicionarDias(inicio, -7) : inicio;
    const end = tipo === 'semana_passada' ? adicionarDias(inicio, -1) : hoje;
    return criarIntervalo(start, end, tipo === 'semana_passada' ? 'semana passada' : 'esta semana');
  }

  if (tipo === 'mes' || tipo === 'mes_passado') {
    const base = tipo === 'mes_passado' ? new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1) : hoje;
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = tipo === 'mes_passado' ? new Date(base.getFullYear(), base.getMonth() + 1, 0) : hoje;
    return criarIntervalo(start, end, tipo === 'mes_passado' ? 'mes passado' : 'este mes');
  }

  if (tipo === 'ano' || tipo === 'ano_passado') {
    const ano = hoje.getFullYear() + (tipo === 'ano_passado' ? -1 : 0);
    return criarIntervalo(new Date(ano, 0, 1), tipo === 'ano_passado' ? new Date(ano, 11, 31) : hoje, tipo === 'ano_passado' ? 'ano passado' : 'este ano');
  }

  if (tipo === 'mes_especifico') {
    const ano = periodo.ano || hoje.getFullYear();
    const start = new Date(ano, periodo.mes - 1, 1);
    const end = new Date(ano, periodo.mes, 0);
    return criarIntervalo(start, end, nomeMes(periodo.mes) + ' de ' + ano);
  }

  if (tipo === 'dia_especifico') {
    const ano = periodo.ano || hoje.getFullYear();
    const data = new Date(ano, periodo.mes - 1, periodo.dia);
    return criarIntervalo(data, data, formatarData(data));
  }

  return criarIntervalo(new Date(hoje.getFullYear(), hoje.getMonth(), 1), hoje, 'este mes');
}

function criarIntervalo(inicio, fim, rotulo) {
  return { inicio: inicioDoDia(inicio), fim: fimDoDia(fim), rotulo };
}

function estaNoIntervalo(valorData, intervalo) {
  if (!intervalo) return true;
  const data = parseDataLocal(valorData);
  if (Number.isNaN(data.getTime())) return false;
  return data >= intervalo.inicio && data <= intervalo.fim;
}

function parseDataLocal(valorData) {
  const texto = String(valorData || '');
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(valorData);
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function fimDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59, 999);
}

function adicionarDias(data, dias) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

function adicionarMesesISO(dataISO, meses) {
  const data = parseDataLocal(dataISO);
  const dia = data.getDate();
  const destino = new Date(data.getFullYear(), data.getMonth() + meses, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  return [
    destino.getFullYear(),
    String(destino.getMonth() + 1).padStart(2, '0'),
    String(destino.getDate()).padStart(2, '0')
  ].join('-');
}

function inicioDaSemana(data) {
  const inicio = inicioDoDia(data);
  const dia = inicio.getDay();
  const deslocamento = dia === 0 ? -6 : 1 - dia;
  return adicionarDias(inicio, deslocamento);
}

function nomeMes(mes) {
  const nomes = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return nomes[mes - 1] || 'mes';
}

function formatarData(data) {
  return String(data.getDate()).padStart(2, '0') + '/' + String(data.getMonth() + 1).padStart(2, '0') + '/' + data.getFullYear();
}

function dataHojeISO() {
  const hoje = new Date();
  return [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, '0'),
    String(hoje.getDate()).padStart(2, '0')
  ].join('-');
}

function formatarDataBR(valor) {
  if (!valor) return '-';
  const texto = String(valor).slice(0, 10);
  const [ano, mes, dia] = texto.split('-');
  if (!ano || !mes || !dia) return texto;
  return `${dia}/${mes}/${ano}`;
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

function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatarIdCartao(id) {
  return `n${id}`;
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
