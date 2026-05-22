import { useState, useEffect } from 'react';
import { Building2, Plus, Trash2, Users, X, Shield } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';

export default function SuperAdminView({ onSelectClub, showToast, showConfirm }) {
  const { t } = useT();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubSlug, setNewClubSlug] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchClubs = async () => {
    try {
      const data = await supabaseService.getAllClubs();
      setClubs(data);
    } catch (e) {
      console.error('Failed to fetch clubs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClubs();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newClubName.trim()) return;
    setIsSaving(true);
    try {
      const slug =
        newClubSlug.trim() ||
        newClubName
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      await supabaseService.createClub({ name: newClubName.trim(), slug });
      setNewClubName('');
      setNewClubSlug('');
      setShowCreateForm(false);
      await fetchClubs();
      if (showToast) showToast('Club created successfully');
    } catch (e) {
      if (showToast) showToast(`Failed to create club: ${e.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (club) => {
    const ok = await showConfirm(`Delete "${club.name}" and all its teams, players, and data? This cannot be undone.`);
    if (!ok) return;
    setIsSaving(true);
    try {
      await supabaseService.deleteClub(club.id);
      await fetchClubs();
      if (showToast) showToast(`Club "${club.name}" deleted`);
    } catch (e) {
      if (showToast) showToast(`Failed to delete: ${e.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-20 text-center font-bold text-muted-foreground animate-pulse">Loading clubs...</div>;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield size={24} className="text-violet-700 dark:text-violet-400" />
            App Administration
          </h2>
          <p className="text-xs text-muted-foreground font-semibold mt-1">
            {clubs.length} club{clubs.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Plus size={14} /> New Club
        </button>
      </div>

      {/* Club Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club) => (
          <div
            key={club.id}
            className="bg-card rounded-lg border border-border p-5 hover:border-violet-300 dark:hover:border-violet-700 transition-all cursor-pointer group"
            onClick={() => {
              localStorage.setItem('nola_selected_club', club.id);
              if (onSelectClub) onSelectClub(club);
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Building2 size={20} className="text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">{club.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{club.slug}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(club);
                }}
                disabled={isSaving}
                className="p-2 text-muted-foreground hover:text-red-700 dark:text-red-400 dark:hover:text-red-400 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {clubs.length === 0 && (
        <div className="bg-card rounded-lg border-2 border-dashed border-border p-16 text-center">
          <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No clubs yet. Create one to get started.</p>
        </div>
      )}

      {/* Create Club Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md border border-border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Building2 size={20} className="text-violet-700 dark:text-violet-400" /> New Club
              </h3>
              <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Club Name *</label>
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="My Club"
                  value={newClubName}
                  onChange={(e) => {
                    setNewClubName(e.target.value);
                    setNewClubSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^a-z0-9-]/g, ''),
                    );
                  }}
                  className="w-full border border-border rounded-lg p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-violet-500 mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Slug</label>
                <input
                  type="text"
                  placeholder="my-club"
                  value={newClubSlug}
                  onChange={(e) => setNewClubSlug(e.target.value)}
                  className="w-full border border-border rounded-lg p-2.5 text-sm font-mono outline-none mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">URL-friendly identifier. Auto-generated from name.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-muted-foreground hover:bg-background transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !newClubName.trim()}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                >
                  {isSaving ? 'Creating...' : 'Create Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
