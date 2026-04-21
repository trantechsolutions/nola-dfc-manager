import { useState, useEffect, useRef } from 'react';
import { Copy, Check, DollarSign, Smartphone, ExternalLink } from 'lucide-react';
import QRCodeLib from 'qrcode';

function QRCode({ value, size = 150 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {});
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl border border-slate-200 dark:border-slate-700"
      style={{ width: size, height: size }}
    />
  );
}

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
    textColor: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-50 dark:bg-slate-800',
    borderColor: 'border-slate-200 dark:border-slate-700',
  };
}

function accountsToMethods(accounts) {
  return accounts
    .filter((a) => a.isActive && a.handle && a.handle.trim())
    .map((a) => ({
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
  remainingBalance,
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

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      showToast?.('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-widest flex items-center gap-2">
          <DollarSign size={14} className="text-emerald-500" /> How to Pay
        </h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Amount due */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount Due</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{formatMoney(amount)}</p>
          <button
            onClick={() => handleCopy(memo, 'memo')}
            className="inline-flex items-center gap-1 mt-1 text-[10px] text-slate-400 hover:text-blue-500 transition-colors"
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
                <div key={method.key} className={`rounded-xl border p-3 ${method.bgColor} ${method.borderColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg ${method.color} flex items-center justify-center`}>
                        <Smartphone size={16} className="text-white" />
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${method.textColor}`}>{method.label}</p>
                        {method.handle && (
                          <button
                            onClick={() => handleCopy(method.handle, method.key)}
                            className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-blue-500"
                          >
                            {copiedField === method.key ? <Check size={10} /> : <Copy size={10} />}
                            {method.handle}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {method.handle && (
                        <button
                          onClick={() => setShowQR(isShowingQR ? null : method.key)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                        >
                          {isShowingQR ? 'Hide QR' : 'QR Code'}
                        </button>
                      )}
                      {deepLink && (
                        <a
                          href={deepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                        >
                          <ExternalLink size={10} /> Pay
                        </a>
                      )}
                    </div>
                  </div>

                  {isShowingQR && method.handle && (
                    <div className="mt-3 flex justify-center">
                      <QRCode value={deepLink || method.handle} size={160} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* No parseable methods — show raw instructions only */
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{paymentInfo}</p>
          </div>
        )}

        {/* Payment instructions always shown below cards when present */}
        {methods.length > 0 && paymentInfo && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-pre-wrap">{paymentInfo}</p>
          </div>
        )}
      </div>
    </div>
  );
}
