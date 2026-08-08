import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, ListChecks } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import ResponsiveModal from '../../components/layout/ResponsiveModal';
import { formControl } from '../../components/layout/formControl';
import { checklistService } from '../../services/checklistService';
import {
  CHECKLIST_ITEM_TYPES,
  CHECKLIST_AUDIENCE,
  CHECKLIST_FORMS,
  ITEM_TYPE_ORDER,
  createItem,
  normalizeItems,
  validateItems,
} from '../../utils/checklist';

/**
 * ChecklistEditor — the admin builder for one season's checklist.
 *
 * Edits the whole item list as a single document and saves it in one upsert,
 * the same shape as RubricEditor. Item keys survive a label edit (see
 * normalizeItems), so renaming a task does not orphan the responses already
 * recorded against it.
 */
export default function ChecklistEditor({
  open,
  onClose,
  teamId,
  seasonId,
  seasonLabel,
  checklist,
  user,
  onSaved,
  showToast,
}) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(checklist?.title || '');
    // A brand new checklist opens with one blank row rather than an empty
    // canvas — there is nothing to click otherwise.
    setItems(checklist?.items?.length ? structuredClone(checklist.items) : [createItem()]);
  }, [open, checklist]);

  if (!open) return null;

  const patchItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, createItem()]);

  const moveItem = (idx, delta) =>
    setItems((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const handleSave = async () => {
    const invalid = validateItems(items);
    if (invalid) {
      const key = invalid.reason === 'url' ? 'checklist.errUrl' : 'checklist.errLabel';
      showToast?.(t(key, { n: invalid.index + 1 }), true);
      return;
    }
    setSaving(true);
    try {
      const saved = await checklistService.saveChecklist({
        teamId,
        seasonId,
        title,
        items: normalizeItems(items),
        // Preserve the published state; publishing is its own deliberate action
        // in ChecklistManager, not a side effect of saving an edit.
        isPublished: checklist?.isPublished === true,
        updatedBy: user?.id,
      });
      showToast?.(t('checklist.saved'));
      onSaved?.(saved);
      onClose?.();
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} size="3xl">
      <ResponsiveModal.Header>
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <ListChecks size={18} />
          {t('checklist.editorTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('checklist.editorSubtitle', { season: seasonLabel || seasonId })}
        </p>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        <div>
          <label htmlFor="checklist-title" className="mb-1.5 block text-sm font-medium text-foreground">
            {t('checklist.listTitle')}
          </label>
          <input
            id="checklist-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('checklist.listTitlePlaceholder')}
            className={formControl}
          />
        </div>

        {items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('checklist.noItems')}</p>
        )}

        {items.map((item, idx) => (
          <ItemRow
            key={item.key}
            t={t}
            item={item}
            index={idx}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            onPatch={(patch) => patchItem(idx, patch)}
            onRemove={() => removeItem(idx)}
            onMove={(delta) => moveItem(idx, delta)}
          />
        ))}

        <button
          type="button"
          onClick={addItem}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus size={14} /> {t('checklist.addItem')}
        </button>
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save size={12} /> {t('common.save')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}

function ItemRow({ t, item, index, isFirst, isLast, onPatch, onRemove, onMove }) {
  const id = `item-${item.key}`;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
        <input
          id={id}
          value={item.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={t('checklist.itemLabelPlaceholder')}
          aria-label={t('checklist.itemLabel')}
          className={`${formControl} font-semibold`}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label={t('checklist.moveUp')} disabled={isFirst} onClick={() => onMove(-1)} icon={ChevronUp} />
          <IconButton label={t('checklist.moveDown')} disabled={isLast} onClick={() => onMove(1)} icon={ChevronDown} />
          <IconButton label={t('checklist.removeItem')} onClick={onRemove} icon={Trash2} destructive />
        </div>
      </div>

      <textarea
        value={item.description}
        onChange={(e) => onPatch({ description: e.target.value })}
        placeholder={t('checklist.itemDescriptionPlaceholder')}
        aria-label={t('checklist.itemDescription')}
        rows={2}
        className={`${formControl} resize-y`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-muted-foreground">
          {t('checklist.itemType')}
          <select
            value={item.type}
            onChange={(e) => onPatch({ type: e.target.value })}
            className={`${formControl} mt-1`}
          >
            {ITEM_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {t(`checklist.types.${type}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-muted-foreground">
          {t('checklist.itemAudience')}
          <select
            value={item.audience}
            onChange={(e) => onPatch({ audience: e.target.value })}
            className={`${formControl} mt-1`}
          >
            <option value={CHECKLIST_AUDIENCE.PARENT}>{t('checklist.audience.parent')}</option>
            <option value={CHECKLIST_AUDIENCE.ADMIN}>{t('checklist.audience.admin')}</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-muted-foreground">
          {t('checklist.itemDueDate')}
          <input
            type="date"
            value={item.dueDate || ''}
            onChange={(e) => onPatch({ dueDate: e.target.value || null })}
            className={`${formControl} mt-1`}
          />
        </label>
      </div>

      {item.type === CHECKLIST_ITEM_TYPES.LINK && (
        <input
          type="url"
          value={item.url}
          onChange={(e) => onPatch({ url: e.target.value })}
          placeholder={t('checklist.itemUrlPlaceholder')}
          aria-label={t('checklist.itemUrl')}
          className={formControl}
        />
      )}

      <p className="text-xs text-muted-foreground">{t(`checklist.typeHelp.${item.type}`)}</p>

      <div className="flex flex-wrap gap-4">
        <Toggle
          label={t('checklist.itemRequired')}
          help={t('checklist.itemRequiredHelp')}
          checked={item.required}
          onChange={(checked) => onPatch({ required: checked })}
        />
        <Toggle
          label={t('checklist.itemVerify')}
          help={t('checklist.itemVerifyHelp')}
          checked={item.requiresVerification}
          onChange={(checked) => onPatch({ requiresVerification: checked })}
        />
        {/* A checkbox because the registry currently holds exactly one form.
            When LINKED_FORM_KEYS grows, this becomes a select over it. */}
        <Toggle
          label={t('checklist.itemMedicalForm')}
          help={t('checklist.itemMedicalFormHelp')}
          checked={item.linkedForm === CHECKLIST_FORMS.MEDICAL_RELEASE}
          onChange={(checked) => onPatch({ linkedForm: checked ? CHECKLIST_FORMS.MEDICAL_RELEASE : null })}
        />
      </div>
    </div>
  );
}

function IconButton({ label, icon, onClick, disabled, destructive }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-30 ${
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}
