import { AlertTriangle, ClipboardList, Wallet } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';
import { useFinanceContext } from '../context/FinanceContext';
import { useAttention } from '../hooks/useAttention';

/**
 * AttentionStrip — the lines above the next-match card when something is
 * waiting on a parent: paperwork due within the week (or overdue), and a
 * balance once the budget is final. Renders nothing at all when there is
 * nothing to do, so it never becomes wallpaper.
 */
export default function AttentionStrip() {
  const { paperwork, balance } = useAttention();
  const { navigate } = useNavigation();
  const { formatMoney } = useFinanceContext();
  const { t } = useT();

  if (paperwork.length === 0 && !balance) return null;

  const dueText = (days) =>
    days < 0
      ? t('nav.overdue')
      : days === 0
        ? t('nav.dueToday')
        : days === 1
          ? t('nav.dueTomorrow')
          : t('nav.dueInDays', { n: days });

  const showPlayer = new Set(paperwork.map((item) => item.player.id)).size > 1;

  return (
    <section
      aria-label={t('nav.needsAttention')}
      className="divide-y divide-border rounded-lg border border-border bg-card"
    >
      {paperwork.map((item) => (
        <div key={`${item.player.id}-${item.key}`} className="flex items-center gap-3 px-4 py-3">
          {item.daysLeft < 0 ? (
            <AlertTriangle size={18} className="shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <ClipboardList size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold text-foreground">{item.label}</span>
            {showPlayer && <span className="text-muted-foreground"> ({item.player.firstName})</span>}{' '}
            <span className={item.daysLeft < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
              {dueText(item.daysLeft)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => navigate('/checklist')}
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            {t('nav.finishIt')}
          </button>
        </div>
      ))}
      {balance && (
        <div className="flex items-center gap-3 px-4 py-3">
          <Wallet size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {t('nav.balanceDue', { amount: formatMoney(balance) })}
          </p>
          <button
            type="button"
            onClick={() =>
              document
                .getElementById('payment-options')
                ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
            }
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {t('nav.payBalance')}
          </button>
        </div>
      )}
    </section>
  );
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
