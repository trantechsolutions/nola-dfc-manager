/**
 * Payment instruction templating.
 *
 * Team payment instructions are free text authored in Team Settings. They may
 * contain merge tokens like `{balance}` so the same instructions render with
 * each family's own numbers instead of a hardcoded amount.
 *
 * Tokens resolve differently depending on where they sit:
 *   - in plain prose, money renders formatted ("$125.00") and text renders as-is
 *   - inside a URL, money renders as a bare number ("125.00") and text is
 *     percent-encoded, so pay links like
 *     `https://pay.example.com/?amount={balance}&note={memo}` are valid.
 *
 * Money tokens also accept arithmetic, so instructions can break a fee into
 * installments without hardcoding anything: `{balance / 3}`, `{ceil(fee/4)}`,
 * `{fee - paid}`, `{balance * 0.5}`. Anything that fails to parse is left on
 * screen verbatim rather than rendering as blank or NaN.
 */

/** Token names, in the order they are offered in the Settings picker. */
export const PAYMENT_TOKENS = [
  { token: 'balance', kind: 'money' },
  { token: 'fee', kind: 'money' },
  { token: 'paid', kind: 'money' },
  { token: 'player', kind: 'text' },
  { token: 'first', kind: 'text' },
  { token: 'last', kind: 'text' },
  { token: 'team', kind: 'text' },
  { token: 'memo', kind: 'text' },
];

// Anything inside braces on a single line is a candidate: a bare token name or
// an arithmetic expression. Resolution decides which; unknown content is left
// exactly as authored.
const TOKEN_RE = /\{([^{}\n]+)\}/g;

const PLAIN_NAME_RE = /^[a-zA-Z0-9_]+$/;

// A `{...}` group is matched as a unit so an expression containing spaces —
// `?amount={balance / 3}` — does not cut the URL short at the space.
const URL_RE = /\b(?:https?:\/\/|www\.)(?:\{[^{}\n]*\}|[^\s<>"'])+/gi;

// `}` is deliberately excluded: a URL commonly ends in a token like `{balance}`.
const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Guards against pathological template input. */
const MAX_EXPRESSION_LENGTH = 200;
const MAX_EXPRESSION_DEPTH = 20;

const EXPRESSION_FUNCTIONS = {
  round: Math.round,
  ceil: Math.ceil,
  floor: Math.floor,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

/**
 * Evaluate an arithmetic expression over the numeric tokens.
 *
 * Hand-rolled recursive descent — never `eval`/`Function`, since the source is
 * operator-authored text that is stored and replayed to every family.
 * Supports + - * / % , parentheses, unary minus, and the functions above.
 *
 * @param {string} expression
 * @param {Record<string, number>} numbers Numeric token values.
 * @returns {{ value: number, usesMoney: boolean } | null} null when unparseable.
 */
export function evaluateExpression(expression, numbers = {}) {
  const src = String(expression ?? '').trim();
  if (!src || src.length > MAX_EXPRESSION_LENGTH) return null;

  let i = 0;
  let depth = 0;
  let usesMoney = false;
  let failed = false;

  const fail = () => {
    failed = true;
    return 0;
  };
  const skipSpace = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const peek = () => {
    skipSpace();
    return src[i];
  };

  const parseExpression = () => {
    if (failed) return 0;
    let value = parseTerm();
    for (;;) {
      const op = peek();
      if (op !== '+' && op !== '-') return value;
      i++;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
  };

  const parseTerm = () => {
    if (failed) return 0;
    let value = parseUnary();
    for (;;) {
      const op = peek();
      if (op !== '*' && op !== '/' && op !== '%') return value;
      i++;
      const rhs = parseUnary();
      if ((op === '/' || op === '%') && rhs === 0) return fail();
      if (op === '*') value *= rhs;
      else if (op === '/') value /= rhs;
      else value %= rhs;
    }
  };

  const parseUnary = () => {
    if (failed) return 0;
    const ch = peek();
    if (ch === '-') {
      i++;
      return -parseUnary();
    }
    if (ch === '+') {
      i++;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = () => {
    if (failed) return 0;
    if (++depth > MAX_EXPRESSION_DEPTH) return fail();
    try {
      const ch = peek();
      if (ch === undefined) return fail();

      if (ch === '(') {
        i++;
        const value = parseExpression();
        if (peek() !== ')') return fail();
        i++;
        return value;
      }

      if (/[0-9.]/.test(ch)) {
        const start = i;
        while (i < src.length && /[0-9.]/.test(src[i])) i++;
        const parsed = Number(src.slice(start, i));
        return Number.isFinite(parsed) ? parsed : fail();
      }

      if (/[a-zA-Z_]/.test(ch)) {
        const start = i;
        while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) i++;
        const name = src.slice(start, i).toLowerCase();

        if (peek() === '(') {
          const fn = EXPRESSION_FUNCTIONS[name];
          if (!fn) return fail();
          i++;
          const args = [];
          if (peek() === ')') i++;
          else {
            for (;;) {
              args.push(parseExpression());
              const next = peek();
              if (next === ',') {
                i++;
                continue;
              }
              if (next === ')') {
                i++;
                break;
              }
              return fail();
            }
          }
          if (failed) return 0;
          return fn(...args);
        }

        if (!Object.prototype.hasOwnProperty.call(numbers, name)) return fail();
        usesMoney = true;
        return numbers[name];
      }

      return fail();
    } finally {
      depth--;
    }
  };

  const value = parseExpression();
  skipSpace();
  if (failed || i !== src.length || !Number.isFinite(value)) return null;
  return { value, usesMoney };
}

/**
 * Build the token value table for one player.
 *
 * Every token gets two forms: `text` (what a human reads) and `url` (what is
 * safe to drop into a query string).
 *
 * @param {object} args
 * @param {string} [args.playerName] Full player name.
 * @param {string} [args.firstName]
 * @param {string} [args.lastName]
 * @param {string} [args.teamName]
 * @param {number} [args.balance] Remaining balance owed.
 * @param {number} [args.fee] Base season fee.
 * @param {number} [args.paid] Amount already paid.
 * @param {string} [args.memo] Suggested payment memo.
 * @param {Function} [args.formatMoney] Currency formatter from the app shell.
 * @returns {Record<string, {text: string, url: string}>}
 */
export function buildPaymentTokens({
  playerName = '',
  firstName = '',
  lastName = '',
  teamName = '',
  balance = 0,
  fee = 0,
  paid = 0,
  memo = '',
  formatMoney,
} = {}) {
  const money = (n) => {
    const value = Math.abs(num(n));
    return {
      text: typeof formatMoney === 'function' ? formatMoney(value) : `$${value.toFixed(2)}`,
      url: value.toFixed(2),
    };
  };
  const text = (s) => ({ text: String(s ?? ''), url: encodeURIComponent(String(s ?? '')) });

  return {
    balance: money(balance),
    fee: money(fee),
    paid: money(paid),
    player: text(playerName),
    first: text(firstName || String(playerName).split(' ')[0] || ''),
    last: text(lastName || String(playerName).split(' ').slice(1).join(' ')),
    team: text(teamName),
    memo: text(memo),
    // Raw numbers + formatter kept alongside the rendered forms so `{balance/3}`
    // can be computed. Not a token itself — `{__math}` resolves to nothing.
    __math: {
      numbers: { balance: Math.abs(num(balance)), fee: Math.abs(num(fee)), paid: Math.abs(num(paid)) },
      formatMoney,
    },
  };
}

/** Renders an evaluated expression in the same style as a plain money token. */
function formatExpressionResult({ value, usesMoney }, meta, form) {
  const rounded = Math.round(value * 100) / 100;
  if (form === 'url') return usesMoney ? rounded.toFixed(2) : String(rounded);
  if (!usesMoney) return String(rounded);
  return typeof meta?.formatMoney === 'function' ? meta.formatMoney(rounded) : `$${rounded.toFixed(2)}`;
}

/**
 * Replace tokens in a single string. A brace group is either a token name or an
 * arithmetic expression over the money tokens; anything else is left untouched
 * so authoring typos stay visible instead of rendering blank.
 *
 * @param {string} str
 * @param {Record<string, {text: string, url: string}>} tokens
 * @param {'text'|'url'} form
 */
function substitute(str, tokens, form) {
  const meta = tokens?.__math;

  return String(str ?? '').replace(TOKEN_RE, (match, inner) => {
    const trimmed = inner.trim();

    if (PLAIN_NAME_RE.test(trimmed)) {
      const value = tokens?.[trimmed.toLowerCase()];
      return value?.[form] ?? match;
    }

    const result = evaluateExpression(trimmed, meta?.numbers);
    return result ? formatExpressionResult(result, meta, form) : match;
  });
}

/**
 * Render instructions to plain text (no link handling). Used for copy-to-clipboard
 * and anywhere a single string is needed.
 *
 * @param {string} template
 * @param {Record<string, {text: string, url: string}>} tokens
 * @returns {string}
 */
export function renderPaymentTemplate(template, tokens) {
  return substitute(template, tokens, 'text');
}

/**
 * Render instructions into display parts, splitting out URLs so they can be
 * rendered as anchors with their tokens percent-encoded.
 *
 * @param {string} template
 * @param {Record<string, {text: string, url: string}>} tokens
 * @returns {Array<{type: 'text', value: string} | {type: 'link', href: string, label: string}>}
 */
export function renderPaymentTemplateParts(template, tokens) {
  const source = String(template ?? '');
  if (!source) return [];

  const parts = [];
  let cursor = 0;

  URL_RE.lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(source)) !== null) {
    let raw = match[0];
    // Trailing sentence punctuation belongs to the prose, not the link.
    const trailing = raw.match(TRAILING_PUNCT_RE)?.[0] || '';
    if (trailing) raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;

    if (match.index > cursor) {
      parts.push({ type: 'text', value: substitute(source.slice(cursor, match.index), tokens, 'text') });
    }

    const resolved = substitute(raw, tokens, 'url');
    parts.push({
      type: 'link',
      href: resolved.startsWith('www.') ? `https://${resolved}` : resolved,
      label: resolved,
    });

    cursor = match.index + raw.length;
  }

  if (cursor < source.length) {
    parts.push({ type: 'text', value: substitute(source.slice(cursor), tokens, 'text') });
  }

  return parts;
}

/**
 * Sample values for the Settings live preview.
 *
 * @param {object} args
 * @param {string} [args.teamName]
 * @param {string} [args.playerName]
 * @param {Function} [args.formatMoney]
 */
export function buildPreviewTokens({ teamName = '', playerName = 'Sample Player', formatMoney } = {}) {
  const [firstName, ...rest] = playerName.split(' ');
  return buildPaymentTokens({
    playerName,
    firstName,
    lastName: rest.join(' '),
    teamName,
    balance: 125,
    fee: 250,
    paid: 125,
    memo: `${playerName} - Season Fee`,
    formatMoney,
  });
}
