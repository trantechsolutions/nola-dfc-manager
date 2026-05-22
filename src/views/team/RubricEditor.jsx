import { useState, useEffect } from 'react';
import { X, Plus, Trash2, RotateCcw, Save, GripVertical } from 'lucide-react';
import { DEFAULT_EVAL_SECTIONS, slugify } from '../../utils/defaultEvaluationRubric';
import { supabaseService } from '../../services/supabaseService';

// Ensure every section/group/skill has a stable unique key.
function ensureKeys(sections) {
  const taken = new Set();
  const unique = (base) => {
    let k = slugify(base) || 'item';
    let suffix = 1;
    while (taken.has(k)) {
      suffix += 1;
      k = `${slugify(base) || 'item'}_${suffix}`;
    }
    taken.add(k);
    return k;
  };
  return sections.map((s) => ({
    key: s.key && !taken.has(s.key) ? (taken.add(s.key), s.key) : unique(s.label),
    label: s.label,
    groups: (s.groups || []).map((g) => ({
      key: g.key && !taken.has(g.key) ? (taken.add(g.key), g.key) : unique(g.label),
      label: g.label,
      skills: (g.skills || []).map((sk) => ({
        key: sk.key && !taken.has(sk.key) ? (taken.add(sk.key), sk.key) : unique(sk.label),
        label: sk.label,
      })),
    })),
  }));
}

export default function RubricEditor({ open, onClose, teamId, user, initialSections, onSaved, showToast }) {
  const [sections, setSections] = useState(() => structuredClone(initialSections || DEFAULT_EVAL_SECTIONS));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSections(structuredClone(initialSections || DEFAULT_EVAL_SECTIONS));
    }
  }, [open, initialSections]);

  if (!open) return null;

  const updateSection = (idx, patch) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const updateGroup = (sIdx, gIdx, patch) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, groups: s.groups.map((g, j) => (j === gIdx ? { ...g, ...patch } : g)) } : s,
      ),
    );
  };
  const updateSkill = (sIdx, gIdx, skIdx, patch) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              groups: s.groups.map((g, j) =>
                j === gIdx ? { ...g, skills: g.skills.map((sk, k) => (k === skIdx ? { ...sk, ...patch } : sk)) } : g,
              ),
            }
          : s,
      ),
    );
  };

  const addSection = () =>
    setSections((prev) => [...prev, { key: `section_${Date.now()}`, label: 'New Section', groups: [] }]);
  const removeSection = (idx) => setSections((prev) => prev.filter((_, i) => i !== idx));

  const addGroup = (sIdx) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? { ...s, groups: [...s.groups, { key: `group_${Date.now()}`, label: 'New Group', skills: [] }] }
          : s,
      ),
    );
  const removeGroup = (sIdx, gIdx) =>
    setSections((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, groups: s.groups.filter((_, j) => j !== gIdx) } : s)),
    );

  const addSkill = (sIdx, gIdx) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              groups: s.groups.map((g, j) =>
                j === gIdx ? { ...g, skills: [...g.skills, { key: `skill_${Date.now()}`, label: 'New Question' }] } : g,
              ),
            }
          : s,
      ),
    );
  const removeSkill = (sIdx, gIdx, skIdx) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              groups: s.groups.map((g, j) =>
                j === gIdx ? { ...g, skills: g.skills.filter((_, k) => k !== skIdx) } : g,
              ),
            }
          : s,
      ),
    );

  const handleResetToDefault = () => {
    if (!window.confirm('Reset to the default rubric? Your custom changes will be discarded.')) return;
    setSections(structuredClone(DEFAULT_EVAL_SECTIONS));
  };

  const handleSave = async () => {
    // Validate: no empty labels
    for (const s of sections) {
      if (!s.label.trim()) {
        showToast?.('Every section needs a name', true);
        return;
      }
      for (const g of s.groups) {
        if (!g.label.trim()) {
          showToast?.(`Group in "${s.label}" needs a name`, true);
          return;
        }
        for (const sk of g.skills) {
          if (!sk.label.trim()) {
            showToast?.(`Question in "${g.label}" needs text`, true);
            return;
          }
        }
      }
    }
    setSaving(true);
    try {
      const normalized = ensureKeys(sections);
      await supabaseService.saveTeamRubric({ teamId, sections: normalized, updatedBy: user?.id });
      showToast?.('Rubric saved');
      onSaved?.(normalized);
      onClose?.();
    } catch (e) {
      showToast?.(`Save failed: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleResetFromDb = async () => {
    if (!window.confirm('Remove your custom rubric and revert to the default?')) return;
    setSaving(true);
    try {
      await supabaseService.deleteTeamRubric(teamId);
      showToast?.('Custom rubric removed');
      onSaved?.(null);
      onClose?.();
    } catch (e) {
      showToast?.(`Reset failed: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
      <div className="bg-card rounded-lg w-full max-w-3xl h-[85vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-foreground">Customize Evaluation Rubric</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sections, groups, and questions apply to every coach evaluating this team.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {sections.map((section, sIdx) => (
            <div key={section.key} className="rounded-lg border border-border bg-background">
              <div className="flex items-center gap-2 p-3 border-b border-border">
                <GripVertical size={14} className="text-muted-foreground shrink-0" />
                <input
                  value={section.label}
                  onChange={(e) => updateSection(sIdx, { label: e.target.value })}
                  placeholder="Section name (e.g. Technical)"
                  className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => removeSection(sIdx)}
                  className="p-1.5 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Delete section"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="p-3 space-y-3">
                {section.groups.map((group, gIdx) => (
                  <div key={group.key} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={group.label}
                        onChange={(e) => updateGroup(sIdx, gIdx, { label: e.target.value })}
                        placeholder="Group name (e.g. Passing)"
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => removeGroup(sIdx, gIdx)}
                        className="p-1.5 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete group"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {group.skills.map((skill, skIdx) => (
                      <div key={skill.key} className="flex items-center gap-2 pl-2">
                        <span className="text-muted-foreground text-xs">•</span>
                        <input
                          value={skill.label}
                          onChange={(e) => updateSkill(sIdx, gIdx, skIdx, { label: e.target.value })}
                          placeholder="Question text"
                          className="flex-1 bg-transparent border-b border-border px-1 py-1 text-xs text-foreground outline-none focus:border-ring"
                        />
                        <button
                          onClick={() => removeSkill(sIdx, gIdx, skIdx)}
                          className="p-1 rounded text-red-400 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete question"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => addSkill(sIdx, gIdx)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 pt-1"
                    >
                      <Plus size={11} /> Add question
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => addGroup(sIdx)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300"
                >
                  <Plus size={12} /> Add group
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addSection}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:border-blue-400 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-400"
          >
            <Plus size={14} /> Add section
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-border bg-background rounded-b-2xl">
          <div className="flex gap-2">
            <button
              onClick={handleResetToDefault}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              title="Load default rubric into the editor (not saved until you click Save)"
            >
              <RotateCcw size={12} /> Load defaults
            </button>
            {initialSections && (
              <button
                onClick={handleResetFromDb}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                title="Remove custom rubric; team falls back to the default"
              >
                <Trash2 size={12} /> Delete custom rubric
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
            >
              <Save size={12} /> Save Rubric
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
