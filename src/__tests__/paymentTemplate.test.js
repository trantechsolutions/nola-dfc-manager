import { describe, it, expect } from 'vitest';
import {
  buildPaymentTokens,
  buildPreviewTokens,
  evaluateExpression,
  renderPaymentTemplate,
  renderPaymentTemplateParts,
} from '../utils/paymentTemplate';

const formatMoney = (n) => `$${Number(n).toFixed(2)}`;

const tokens = buildPaymentTokens({
  playerName: 'Alex Rivera',
  firstName: 'Alex',
  lastName: 'Rivera',
  teamName: 'NOLA DFC 2012B',
  balance: 125,
  fee: 250,
  paid: 125,
  memo: 'Alex Rivera - Season Fee',
  formatMoney,
});

describe('renderPaymentTemplate', () => {
  it('substitutes money tokens with formatted amounts', () => {
    expect(renderPaymentTemplate('You owe {balance} of {fee}.', tokens)).toBe('You owe $125.00 of $250.00.');
  });

  it('substitutes text tokens', () => {
    expect(renderPaymentTemplate('{first} on {team}', tokens)).toBe('Alex on NOLA DFC 2012B');
  });

  it('is case- and whitespace-insensitive inside the braces', () => {
    expect(renderPaymentTemplate('{ BALANCE }', tokens)).toBe('$125.00');
  });

  it('leaves unknown tokens untouched so typos stay visible', () => {
    expect(renderPaymentTemplate('{blance} owed', tokens)).toBe('{blance} owed');
  });

  it('returns an empty string for empty input', () => {
    expect(renderPaymentTemplate('', tokens)).toBe('');
  });
});

describe('math in tokens', () => {
  it('splits a balance into installments', () => {
    expect(renderPaymentTemplate('3 payments of {balance / 3}', tokens)).toBe('3 payments of $41.67');
  });

  it('supports the rounding helpers', () => {
    expect(renderPaymentTemplate('{ceil(balance / 3)}', tokens)).toBe('$42.00');
    expect(renderPaymentTemplate('{floor(balance / 3)}', tokens)).toBe('$41.00');
    expect(renderPaymentTemplate('{round(balance / 3)}', tokens)).toBe('$42.00');
  });

  it('subtracts one money token from another', () => {
    expect(renderPaymentTemplate('{fee - paid} left', tokens)).toBe('$125.00 left');
  });

  it('honors parentheses and precedence', () => {
    expect(renderPaymentTemplate('{(fee - paid) / 2}', tokens)).toBe('$62.50');
    expect(renderPaymentTemplate('{fee - paid / 2}', tokens)).toBe('$187.50');
  });

  it('renders a pure-number expression without currency', () => {
    expect(renderPaymentTemplate('{2 * 3}', tokens)).toBe('6');
  });

  it('resolves math inside links as a bare number', () => {
    const parts = renderPaymentTemplateParts('https://pay.example.com/?amount={balance / 3}', tokens);
    expect(parts[0].href).toBe('https://pay.example.com/?amount=41.67');
  });

  it('leaves bad expressions on screen rather than rendering NaN', () => {
    expect(renderPaymentTemplate('{balance / 0}', tokens)).toBe('{balance / 0}');
    expect(renderPaymentTemplate('{balance +}', tokens)).toBe('{balance +}');
    expect(renderPaymentTemplate('{balance / unknown}', tokens)).toBe('{balance / unknown}');
    expect(renderPaymentTemplate('{player / 2}', tokens)).toBe('{player / 2}');
  });

  it('refuses to run anything but arithmetic', () => {
    expect(evaluateExpression('alert(1)', { balance: 125 })).toBeNull();
    expect(evaluateExpression('constructor', { balance: 125 })).toBeNull();
    expect(evaluateExpression('toString', { balance: 125 })).toBeNull();
    expect(evaluateExpression('1'.repeat(300), { balance: 125 })).toBeNull();
  });

  it('flags whether an expression touched a money token', () => {
    expect(evaluateExpression('balance / 5', { balance: 125 })).toEqual({ value: 25, usesMoney: true });
    expect(evaluateExpression('4 % 3', {})).toEqual({ value: 1, usesMoney: false });
    expect(evaluateExpression('-fee + 10', { fee: 250 })).toEqual({ value: -240, usesMoney: true });
    expect(evaluateExpression('max(1, 9, 4)', {})).toEqual({ value: 9, usesMoney: false });
  });
});

describe('renderPaymentTemplateParts', () => {
  it('splits URLs out as links and resolves tokens URL-safely inside them', () => {
    const parts = renderPaymentTemplateParts('Pay {balance} here: https://pay.example.com/?amount={balance}', tokens);

    expect(parts[0]).toEqual({ type: 'text', value: 'Pay $125.00 here: ' });
    expect(parts[1]).toEqual({
      type: 'link',
      href: 'https://pay.example.com/?amount=125.00',
      label: 'https://pay.example.com/?amount=125.00',
    });
  });

  it('percent-encodes text tokens inside links', () => {
    const parts = renderPaymentTemplateParts('https://pay.example.com/?note={memo}', tokens);
    expect(parts[0].href).toBe('https://pay.example.com/?note=Alex%20Rivera%20-%20Season%20Fee');
  });

  it('keeps trailing sentence punctuation out of the link', () => {
    const parts = renderPaymentTemplateParts('Go to https://example.com/pay.', tokens);
    expect(parts[1].href).toBe('https://example.com/pay');
    expect(parts[2]).toEqual({ type: 'text', value: '.' });
  });

  it('prefixes bare www links with https', () => {
    const parts = renderPaymentTemplateParts('www.example.com/pay', tokens);
    expect(parts[0].href).toBe('https://www.example.com/pay');
  });

  it('returns a single text part when there is no link', () => {
    const parts = renderPaymentTemplateParts('Venmo @team — {balance} due', tokens);
    expect(parts).toEqual([{ type: 'text', value: 'Venmo @team — $125.00 due' }]);
  });

  it('handles repeated calls without regex lastIndex leakage', () => {
    const template = 'https://example.com/a https://example.com/b';
    const first = renderPaymentTemplateParts(template, tokens);
    const second = renderPaymentTemplateParts(template, tokens);
    expect(second).toEqual(first);
    expect(first.filter((p) => p.type === 'link')).toHaveLength(2);
  });
});

describe('buildPaymentTokens', () => {
  it('uses absolute values so a credit balance never renders negative', () => {
    const t = buildPaymentTokens({ balance: -40, formatMoney });
    expect(t.balance.text).toBe('$40.00');
    expect(t.balance.url).toBe('40.00');
  });

  it('derives first and last name from the full name when not supplied', () => {
    const t = buildPaymentTokens({ playerName: 'Sam Van Dyke' });
    expect(t.first.text).toBe('Sam');
    expect(t.last.text).toBe('Van Dyke');
  });

  it('falls back to a plain dollar format without formatMoney', () => {
    expect(buildPaymentTokens({ balance: 12.5 }).balance.text).toBe('$12.50');
  });
});

describe('buildPreviewTokens', () => {
  it('supplies sample numbers and the real team name', () => {
    const t = buildPreviewTokens({ teamName: 'NOLA DFC 2012B', formatMoney });
    expect(t.balance.text).toBe('$125.00');
    expect(t.team.text).toBe('NOLA DFC 2012B');
    expect(t.memo.text).toBe('Sample Player - Season Fee');
  });
});
