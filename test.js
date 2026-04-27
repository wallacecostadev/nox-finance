/**
 * Script de teste - Teste o parser sem precisar do WhatsApp
 * Execute: node test.js
 */

const { parsearMensagem } = require('./parser');

console.log('=== NOX FINANCE - Testes ===\n');

const testes = [
  'recebi 5000 do salario',
  'gastei 150 no mercado',
  'paguei 200 de luz',
  'cartao de 300 na ifood',
  'saldo atual',
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
