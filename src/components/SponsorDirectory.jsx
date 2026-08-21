import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Globe,
  MapPin,
  CalendarClock,
  Handshake,
  Loader2,
  Link2,
  Receipt,
} from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import SponsorFormModal from './SponsorFormModal';
import {
  SPONSOR_STATUSES,
  SPONSOR_STATUS_COLORS,
  sponsorInitials,
  normalizeWebsite,
  unlinkedLedgerSponsors,
  ledgerTotalsBySponsor,
} from '../utils/sponsors';

/**
 * SponsorDirectory — the team's sponsor book: who they are, how to reach them,
 * what they pledged, and their logo, all in one place a manager can open mid
 * phone call.
 *
 * Pledges live here; the money itself stays in the ledger, so the committed
 * total is deliberately labelled as pledged rather than raised. Sponsorship
 * deposits that have no card yet are surfaced as suggestions, and attaching one
 * links the ledger rows by id — the ledger keeps its own title from then on.
 */
export default function SponsorDirectory({
  sponsors = [],
  transactions = [],
  loading,
  isSaving,
  committedTotal = 0,
  onSave,
  onDelete,
  onLink,
  onImportFromLedger,
  formatMoney,
  showConfirm,
  canEdit = false,
}) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState(null); // sponsor object, or 'new'
  const [busyId, setBusyId] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const suggestions = useMemo(() => (canEdit ? unlinkedLedgerSponsors(transactions) : []), [transactions, canEdit]);
  const ledgerTotals = useMemo(() => ledgerTotalsBySponsor(transactions), [transactions]);

  const runLedgerAction = async (key, action) => {
    setBusyKey(key);
    try {
      await action();
    } finally {
      setBusyKey(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sponsors.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.name, s.tier, s.contactName, s.email, s.phone, s.notes]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [sponsors, search, statusFilter]);

  const counts = useMemo(() => {
    const byStatus = { all: sponsors.length };
    SPONSOR_STATUSES.forEach((s) => {
      byStatus[s] = sponsors.filter((x) => x.status === s).length;
    });
    return byStatus;
  }, [sponsors]);

  const handleDelete = async (sponsor) => {
    const ok = await showConfirm(t('sponsors.directory.deleteConfirm', { name: sponsor.name }));
    if (!ok) return;
    setBusyId(sponsor.id);
    try {
      await onDelete(sponsor.id, sponsor.logoPath);
    } finally {
      setBusyId(null);
    }
  };

  const openEditor = (sponsor) => setEditing(sponsor || 'new');

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Handshake size={18} className="text-emerald-700 dark:text-emerald-400" />
            {t('sponsors.directory.heading')}
          </h3>
          <p className="text-xs text-muted-foreground font-semibold mt-0.5">
            {t('sponsors.directory.summary', {
              n: sponsors.length,
              amount: formatMoney(committedTotal),
            })}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => openEditor(null)}
            className="bg-accent text-accent-foreground px-4 py-2 rounded-lg font-semibold text-xs hover:bg-accent/90 flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto"
          >
            <Plus size={14} /> {t('sponsors.directory.add')}
          </button>
        )}
      </div>

      {/* FILTERS */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('sponsors.directory.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1 bg-muted rounded-lg p-0.5 w-fit">
          {['all', ...SPONSOR_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                statusFilter === s ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? t('common.all') : t(`sponsors.directory.statuses.${s}`)} ({counts[s] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* FROM THE LEDGER — sponsorship deposits with no card yet */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50/60 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
          <div>
            <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm flex items-center gap-2">
              <Receipt size={15} /> {t('sponsors.directory.fromLedger')}
            </h4>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/70 font-medium mt-0.5">
              {t('sponsors.directory.fromLedgerHint')}
            </p>
          </div>
          <div className="space-y-2">
            {suggestions.map((group) => (
              <div
                key={group.key}
                className="bg-card rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground text-sm truncate">{group.title}</p>
                  <p className="text-xs text-muted-foreground font-medium">
                    {t('sponsors.directory.ledgerEntries', {
                      n: group.txIds.length,
                      amount: formatMoney(group.total),
                    })}
                    {group.broughtInBy.length > 0 && (
                      <span> · {t('sponsors.directory.broughtIn', { names: group.broughtInBy.join(', ') })}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {sponsors.length > 0 && (
                    <select
                      defaultValue=""
                      disabled={busyKey === group.key}
                      onChange={(e) => {
                        const sponsorId = e.target.value;
                        e.target.value = '';
                        if (sponsorId) runLedgerAction(group.key, () => onLink(sponsorId, group.txIds));
                      }}
                      className="bg-background border border-border text-xs font-semibold rounded-lg px-2 py-1.5 cursor-pointer"
                      aria-label={t('sponsors.directory.linkExisting')}
                    >
                      <option value="">{t('sponsors.directory.linkExisting')}</option>
                      {sponsors.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => runLedgerAction(group.key, () => onImportFromLedger(group))}
                    disabled={busyKey === group.key}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
                  >
                    {busyKey === group.key ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {t('sponsors.directory.addFromLedger')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIST */}
      {loading ? (
        <div className="bg-background p-12 rounded-lg border border-border text-center text-muted-foreground font-semibold">
          <Loader2 className="animate-spin mx-auto mb-2" size={20} />
          {t('common.loading')}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-background p-12 rounded-lg border border-border text-center text-muted-foreground font-semibold italic">
          {sponsors.length === 0 ? t('sponsors.directory.empty') : t('sponsors.directory.noMatch')}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => {
            const website = normalizeWebsite(s.website);
            return (
              <div
                key={s.id}
                className="bg-card rounded-lg border border-border shadow-sm p-4 flex flex-col gap-3 h-full"
              >
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden">
                    {s.logoUrl ? (
                      <img src={s.logoUrl} alt={s.name} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{sponsorInitials(s.name)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground truncate">{s.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${SPONSOR_STATUS_COLORS[s.status] || SPONSOR_STATUS_COLORS.prospect}`}
                      >
                        {t(`sponsors.directory.statuses.${s.status}`)}
                      </span>
                      {s.tier && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                          {s.tier}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.committedAmount > 0 && (
                    <div className="text-right shrink-0">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm whitespace-nowrap">
                        {formatMoney(s.committedAmount)}
                      </span>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('sponsors.directory.pledgedLabel')}
                      </p>
                    </div>
                  )}
                </div>

                {/* What the ledger says actually arrived, linked by id rather
                    than by name so a renamed sponsor keeps its history. */}
                {ledgerTotals[s.id] && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background rounded-lg px-2 py-1.5">
                    <Link2 size={12} className="shrink-0 text-muted-foreground" />
                    {t('sponsors.directory.receivedLine', {
                      amount: formatMoney(ledgerTotals[s.id].received),
                      n: ledgerTotals[s.id].count,
                    })}
                  </p>
                )}

                <div className="space-y-1.5 text-xs font-medium text-muted-foreground">
                  {s.contactName && <p className="font-semibold text-foreground">{s.contactName}</p>}
                  {s.email && (
                    <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 hover:text-foreground break-all">
                      <Mail size={12} className="shrink-0" /> {s.email}
                    </a>
                  )}
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                      <Phone size={12} className="shrink-0" /> {s.phone}
                    </a>
                  )}
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:text-foreground break-all"
                    >
                      <Globe size={12} className="shrink-0" /> {s.website}
                    </a>
                  )}
                  {s.address && (
                    <p className="flex items-center gap-1.5">
                      <MapPin size={12} className="shrink-0" /> {s.address}
                    </p>
                  )}
                  {s.renewalDate && (
                    <p className="flex items-center gap-1.5">
                      <CalendarClock size={12} className="shrink-0" />
                      {t('sponsors.directory.renewsOn', {
                        date: new Date(`${s.renewalDate}T00:00:00`).toLocaleDateString(),
                      })}
                    </p>
                  )}
                </div>

                {s.notes && (
                  <p className="text-xs text-muted-foreground bg-background rounded-lg p-2 whitespace-pre-line">
                    {s.notes}
                  </p>
                )}

                {canEdit && (
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
                    <button
                      onClick={() => openEditor(s)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-background"
                    >
                      <Pencil size={12} /> {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    >
                      {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <SponsorFormModal
          key={editing === 'new' ? 'new' : editing.id}
          sponsor={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={onSave}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
