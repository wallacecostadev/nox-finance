/**
 * Script de teste - Teste o parser sem precisar do WhatsApp
 * Execute: node test.js
 */

const { parsearMensagem } = require('./parser');

console.log('=== NOX FINANCE - Testes ===\n');

const testes = [
  'recebi 5000 do salario',
  'gastei 150 no mercado no pix',
  'gastei 80 no mercado no debito',
  'comprei 35 no dinheiro',
  'cadastrar cartao Nubank limite 4000 vencimento 10',
  'cadastrei meu cartao Nubank com limite de 4000 vencimento dia 10',
  'cartao Nubank limite 4000 vence 10',
  'cartao',
  'editar cartao Nubank limite 5000 vencimento 15 fechamento 5',
  'excluir cartao Nubank',
  'gastei 120 no credito Nubank no mercado',
  'fatura Nubank',
  'cartoes',
  'corrigir ultimo valor 95',
  'corrigir 12 pix',
  'apagar ultimo',
  'paguei 200 de luz',
  'cartao de 300 na ifood',
  'saldo atual',
  'saldo de hoje',
  'gastos de ontem',
  'extrato mes passado',
  'receitas de marco 2026',
  'fatura Nubank semana passada',
  'quanto gastei no mes?',
  'extrato da semana',
  'ajuda',
  'ganhei 1000 de freelance',
  'gastei 50 com uber',
];

testes.forEach(mensagem => {
  const resultado = parsearMensagem(mensagem);
  console.log(`Mensagem: "${mensagem}"`);
  console.log(`Resultado: ${JSON.stringify(resultado, null, 2)}`);
  console.log('---');
});
