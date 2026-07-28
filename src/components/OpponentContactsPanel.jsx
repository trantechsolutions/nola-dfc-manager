import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Users, Mail, Phone } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

const ContactRow = ({ contact, canEdit, onUpdate, onDelete }) => {
  const { t } = useT();

  const commit = (field, value) => {
    if ((contact[field] || '') === value) return;
    onUpdate(contact.id, { [field]: value });
  };

  return (
    <div className="bg-card rounded-lg border border-border p-3 flex flex-wrap items-center gap-2">
      <input
        type="text"
        defaultValue={contact.clubName || ''}
        disabled={!canEdit}
        placeholder={t('schedule.clubNamePlaceholder')}
        onBlur={(e) => commit('clubName', e.target.value)}
        className="min-w-[9rem] flex-1 px-2 py-1 text-sm font-semibold bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="text"
        defaultValue={contact.contactName || ''}
        disabled={!canEdit}
        placeholder={t('schedule.contactNamePlaceholder')}
        onBlur={(e) => commit('contactName', e.target.value)}
        className="min-w-[8rem] flex-1 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <div className="flex items-center gap-1.5 min-w-[9rem] flex-1">
        <Phone size={13} className="text-muted-foreground shrink-0" />
        <input
          type="tel"
          defaultValue={contact.phone || ''}
          disabled={!canEdit}
          placeholder={t('schedule.phonePlaceholder')}
          onBlur={(e) => commit('phone', e.target.value)}
          className="w-full px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-1.5 min-w-[11rem] flex-1">
        <Mail size={13} className="text-muted-foreground shrink-0" />
        <input
          type="email"
          defaultValue={contact.email || ''}
          disabled={!canEdit}
          placeholder={t('schedule.emailPlaceholder')}
          onBlur={(e) => commit('email', e.target.value)}
          className="w-full px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <input
        type="text"
        defaultValue={contact.notes || ''}
        disabled={!canEdit}
        placeholder={t('schedule.notesPlaceholder')}
        onBlur={(e) => commit('notes', e.target.value)}
        className="min-w-[10rem] flex-[2] px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      {canEdit && (
        <button
          onClick={() => onDelete(contact.id)}
          title={t('common.delete')}
          className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 ml-auto"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
};

export default function OpponentContactsPanel({
  contacts = [],
  loading = false,
  canEdit = false,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(true);
  const [newClubName, setNewClubName] = useState('');

  const handleAdd = () => {
    const clubName = newClubName.trim();
    if (!clubName) return;
    onCreate({ clubName });
    setNewClubName('');
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Users size={15} className="text-muted-foreground" />
          {t('schedule.clubContacts')}
          {contacts.length > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {contacts.length}
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-3 pt-0 space-y-2">
          {canEdit && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newClubName}
                onChange={(e) => setNewClubName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder={t('schedule.newClubPlaceholder')}
                className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Plus size={14} /> {t('schedule.addContact')}
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-4">{t('common.loading')}</div>
          ) : contacts.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground italic py-4">{t('schedule.noContacts')}</div>
          ) : (
            contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                canEdit={canEdit}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
