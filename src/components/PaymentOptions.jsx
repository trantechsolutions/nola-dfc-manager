import { useState, useEffect, useRef } from 'react';
import { Copy, Check, DollarSign, Smartphone, ExternalLink } from 'lucide-react';
import QRCodeLib from 'qrcode';
import { buildPaymentTokens } from '../utils/paymentTemplate';
import { isPayableAccount } from '../utils/accounts';
import PaymentInstructionsText from './PaymentInstructionsText';

function QRCode({ value, label, size = 150 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    // Fixed black-on-white regardless of theme: a scanner needs the contrast,
    // and inverting a QR for dark mode is what stops phones reading it.
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {});
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      // A canvas is a blank element to a screen reader. Naming it is the only
      // way the code is announced as anything at all.
      role="img"
      aria-label={label}
      className="rounded-lg border border-border"
      style={{ width: size, height: size }}
    />
  );
}

// The card behind these chips is a tinted pastel that flips to a dark tint, so
// the chip cannot hardcode a surface colour — `bg-white/80 text-foreground` put
// #dee2e6 text on a near-white chip in dark mode, about 1.05:1. Theme tokens
// are the whole point: --card and --foreground are a designed pair and stay
// legible in both. py-1.5 clears the 24px WCAG 2.5.8 target minimum.
const CHIP =
  'shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function getServiceStyle(name) {
  const n = name.toLowerCase();
  if (n.includes('venmo'))
    return {
      type: 'venmo',
      color: 'bg-blue-500',
      textColor: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
    };
  if (n.includes('zelle'))
    return {
      type: 'zelle',
      color: 'bg-violet-500',
      textColor: 'text-violet-700 dark:text-violet-300',
      bgColor: 'bg-violet-50 dark:bg-violet-900/20',
      borderColor: 'border-violet-200 dark:border-violet-800',
    };
  if (n.includes('cash app') || n.includes('cashapp'))
    return {
      type: 'cashapp',
      color: 'bg-emerald-500',
      textColor: 'text-emerald-700 dark:text-emerald-300',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
    };
  return {
    type: 'other',
    color: 'bg-slate-500',
    textColor: 'text-foreground',
    bgColor: 'bg-background',
    borderColor: 'border-border',
  };
}

function accountsToMethods(accounts) {
  return accounts.filter(isPayableAccount).map((a) => ({
    key: a.id,
    label: a.name,
    handle: a.handle.trim(),
    ...getServiceStyle(a.name),
  }));
}

function parsePaymentMethods(paymentInfo) {
  if (!paymentInfo) return [];
  const methods = [];
  const text = paymentInfo.toLowerCase();

  const venmoMatch = paymentInfo.match(/venmo[:\s]*@?(\S+)/i);
  if (venmoMatch || text.includes('venmo')) {
    const handle = venmoMatch?.[1]?.replace(/^@/, '') || '';
    methods.push({
      key: 'venmo',
      type: 'venmo',
      label: 'Venmo',
      handle: handle ? `@${handle}` : '',
      color: 'bg-blue-500',
      textColor: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
    });
  }

  const zelleMatch = paymentInfo.match(/zelle[:\s]*(\S+@\S+|\S+)/i);
  if (zelleMatch || text.includes('zelle')) {
    methods.push({
      key: 'zelle',
      type: 'zelle',
      label: 'Zelle',
      handle: zelleMatch?.[1] || '',
      color: 'bg-violet-500',
      textColor: 'text-violet-700 dark:text-violet-300',
      bgColor: 'bg-violet-50 dark:bg-violet-900/20',
      borderColor: 'border-violet-200 dark:border-violet-800',
    });
  }

  const cashMatch = paymentInfo.match(/cash\s*app[:\s]*\$?(\S+)/i);
  if (cashMatch || text.includes('cash app') || text.includes('cashapp')) {
    const tag = cashMatch?.[1]?.replace(/^\$/, '') || '';
    methods.push({
      key: 'cashapp',
      type: 'cashapp',
      label: 'Cash App',
      handle: tag ? `$${tag}` : '',
      color: 'bg-emerald-500',
      textColor: 'text-emerald-700 dark:text-emerald-300',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
    });
  }

  return methods;
}

function getDeepLink(type, handle, amount, memo) {
  const cleanHandle = handle.replace(/^[@$]/, '');
  switch (type) {
    case 'venmo':
      return `https://venmo.com/${cleanHandle}?txn=pay&amount=${amount}&note=${encodeURIComponent(memo)}`;
    case 'cashapp':
      return `https://cash.app/$${cleanHandle}/${amount}`;
    default:
      return null;
  }
}

export default function PaymentOptions({
  paymentInfo,
  accounts = [],
  playerName,
  firstName,
  lastName,
  teamName,
  remainingBalance,
  baseFee = 0,
  totalPaid = 0,
  formatMoney,
  showToast,
}) {
  const [copiedField, setCopiedField] = useState(null);
  const [showQR, setShowQR] = useState(null);

  if (remainingBalance <= 0) return null;

  const structuredMethods = accountsToMethods(accounts);
  const methods = structuredMethods.length > 0 ? structuredMethods : parsePaymentMethods(paymentInfo);
  const amount = Math.abs(remainingBalance);
  const memo = `${playerName} - Season Fee`;

  if (methods.length === 0 && !paymentInfo) return null;

  const tokens = buildPaymentTokens({
    playerName,
    firstName,
    lastName,
    teamName,
    balance: amount,
    fee: baseFee,
    paid: totalPaid,
    memo,
    formatMoney,
  });

  // The unhandled rejection was silent: clipboard access is denied outright on
  // an insecure origin and on some in-app browsers, so the parent tapped a
  // handle, saw nothing change, and had no way to know it hadn't copied.
  const handleCopy = (text, field) => {
    const failed = () => showToast?.('Could not copy — select the text to copy it manually', true);
    // The API is absent entirely on an insecure origin, so the optional call
    // has to be checked before it is treated as a promise.
    const writing = navigator.clipboard?.writeText(text);
    if (!writing) return failed();
    writing
      .then(() => {
        setCopiedField(field);
        showToast?.('Copied to clipboard');
        setTimeout(() => setCopiedField(null), 2000);
      })
      .catch(failed);
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-foreground text-xs flex items-center gap-2">
          <DollarSign size={14} className="text-emerald-700 dark:text-emerald-400" /> How to Pay
        </h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Amount due */}
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Amount Due</p>
          <p className="text-2xl font-bold text-foreground">{formatMoney(amount)}</p>
          {/* `hover:text-blue-700 dark:text-blue-400` read as a matched pair but
              isn't one — the dark variant has no hover scope, so dark mode
              painted the memo permanently blue while light mode kept it muted.
              One hover treatment, both themes. */}
          <button
            onClick={() => handleCopy(memo, 'memo')}
            aria-label={`Copy payment memo: ${memo}`}
            className="mt-1 inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copiedField === 'memo' ? <Check size={10} /> : <Copy size={10} />}
            Memo: {memo}
          </button>
        </div>

        {/* Payment method cards */}
        {methods.length > 0 ? (
          <div className="space-y-2">
            {methods.map((method) => {
              const deepLink = getDeepLink(method.type, method.handle, amount, memo);
              const isShowingQR = showQR === method.key;

              return (
                <div key={method.key} className={`rounded-lg border p-3 ${method.bgColor} ${method.borderColor}`}>
                  <div className="flex items-start justify-between gap-2">
                    {/* min-w-0 lets this column shrink. Without it a long handle
                        — a Zeffy donation URL, say — refuses to give ground and
                        shoves the buttons out past the card edge. */}
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div
                        className={`h-8 w-8 shrink-0 rounded-lg ${method.color} flex items-center justify-center`}
                        aria-hidden="true"
                      >
                        <Smartphone size={16} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${method.textColor}`}>{method.label}</p>
                        {method.handle && (
                          <button
                            onClick={() => handleCopy(method.handle, method.key)}
                            // The visible label is the handle itself, which tells
                            // a screen reader nothing about what the button does.
                            aria-label={`Copy ${method.label} handle ${method.handle}`}
                            className="flex max-w-full items-start gap-1 rounded text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {copiedField === method.key ? (
                              <Check size={10} className="mt-0.5 shrink-0" />
                            ) : (
                              <Copy size={10} className="mt-0.5 shrink-0" />
                            )}
                            {/* Wraps rather than truncates: a handle a parent
                                cannot read in full is a handle they cannot
                                check against their banking app. */}
                            <span className="break-all">{method.handle}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {method.handle && (
                        <button
                          onClick={() => setShowQR(isShowingQR ? null : method.key)}
                          aria-expanded={isShowingQR}
                          aria-controls={`qr-${method.key}`}
                          className={CHIP}
                        >
                          {isShowingQR ? 'Hide QR' : 'QR Code'}
                        </button>
                      )}
                      {deepLink && (
                        <a
                          href={deepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Pay ${formatMoney(amount)} with ${method.label} (opens in a new tab)`}
                          className={`${CHIP} flex items-center gap-1`}
                        >
                          <ExternalLink size={10} aria-hidden="true" /> Pay
                        </a>
                      )}
                    </div>
                  </div>

                  {isShowingQR && method.handle && (
                    <div id={`qr-${method.key}`} className="mt-3 flex justify-center">
                      <QRCode
                        value={deepLink || method.handle}
                        label={`${method.label} payment code for ${method.handle}`}
                        size={160}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* No parseable methods — show raw instructions only */
          <div className="bg-background rounded-lg p-3">
            <PaymentInstructionsText template={paymentInfo} tokens={tokens} className="text-xs text-foreground" />
          </div>
        )}

        {/* Payment instructions always shown below cards when present */}
        {methods.length > 0 && paymentInfo && (
          <div className="pt-2 border-t border-border">
            <PaymentInstructionsText template={paymentInfo} tokens={tokens} className="text-xs text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
