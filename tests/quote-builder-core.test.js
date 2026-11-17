/*
  Testes de assets/quote-builder-core.js (cálculos do orçamento).
  Rodar: node --test tests/quote-builder-core.test.js
  Esta pasta não faz parte do tema (o Shopify ignora).
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../assets/quote-builder-core.js');

test('parseMoney entende formato brasileiro, americano e número', () => {
  assert.equal(core.parseMoney('1.234,56'), 123456);
  assert.equal(core.parseMoney('1234.56'), 123456);
  assert.equal(core.parseMoney('R$ 89,90'), 8990);
  assert.equal(core.parseMoney(12.5), 1250);
  assert.equal(core.parseMoney(''), 0);
  assert.equal(core.parseMoney('abc'), 0);
  assert.equal(core.parseMoney('-50'), 5000);
});

test('formatMoney e moneyInputValue', () => {
  assert.equal(core.formatMoney(123456), 'R$ 1.234,56');
  assert.equal(core.moneyInputValue(8990), '89,90');
});

test('computeTotals separa produtos e serviços, aplica desconto % e frete', () => {
  const quote = {
    items: [
      { type: 'product', qty: 2, unitCents: 10000 },
      { type: 'service', qty: 1, unitCents: 5000 }
    ],
    discount: { mode: 'percent', value: 10 },
    shippingCents: 1500
  };
  const t = core.computeTotals(quote);
  assert.deepEqual(t, { products: 20000, services: 5000, subtotal: 25000, discount: 2500, shipping: 1500, total: 24000, itemCount: 3 });
});

test('desconto em R$ nunca passa do subtotal e % aceita decimal', () => {
  const items = [{ type: 'product', qty: 1, unitCents: 1000 }];
  assert.equal(core.computeTotals({ items, discount: { mode: 'amount', value: 999999 } }).total, 0);
  assert.equal(core.computeTotals({ items, discount: { mode: 'percent', value: 2.5 } }).discount, 25);
  assert.equal(core.computeTotals({ items, discount: { mode: 'percent', value: 150 } }).discount, 1000);
});

test('quantidade inválida vira 1 e não muta o item original', () => {
  const item = { type: 'product', qty: 0, unitCents: 500 };
  assert.equal(core.lineTotal(item), 500);
  assert.equal(item.qty, 0);
});

test('quoteNumber e datas', () => {
  assert.equal(core.quoteNumber(new Date(2026, 10, 17), 3), 'DMR-261117-003');
  assert.equal(core.formatDate(core.addDays(new Date(2026, 10, 28).toISOString(), 7)), '05/12/2026');
});

test('cartPermalink só usa produtos com variante numérica', () => {
  const items = [
    { type: 'product', variantId: '111', qty: 2 },
    { type: 'service', variantId: '', qty: 1 },
    { type: 'product', variantId: 'abc', qty: 1 }
  ];
  assert.equal(core.cartPermalink('https://loja.com/', '/', items), 'https://loja.com/cart/111:2');
  assert.equal(core.cartPermalink('https://loja.com', '/pt/', items), 'https://loja.com/pt/cart/111:2');
  assert.equal(core.cartPermalink('https://loja.com', '/', []), '');
});

test('whatsappNumber normaliza telefone brasileiro', () => {
  assert.equal(core.whatsappNumber('(11) 98765-4321'), '5511987654321');
  assert.equal(core.whatsappNumber('+55 11 3456-7890'), '551134567890');
  assert.equal(core.whatsappNumber('123'), '');
});

test('whatsappText resume itens e total', () => {
  const text = core.whatsappText({
    number: 'DMR-261117-001',
    createdAt: new Date(2026, 10, 17).toISOString(),
    validDays: 7,
    client: { name: 'Cliente Teste' },
    items: [{ type: 'product', title: 'Câmera Bullet', qty: 2, unitCents: 15000 }],
    discount: { mode: 'percent', value: 0 },
    shippingCents: 0,
    payment: 'PIX'
  }, { name: 'DMR Info Tecnologia' });
  assert.match(text, /\*Orçamento DMR-261117-001\* — DMR Info Tecnologia/);
  assert.match(text, /2x Câmera Bullet — R\$ 300,00/);
  assert.match(text, /\*Total: R\$ 300,00\*/);
  assert.match(text, /Válido até: 24\/11\/2026/);
});
