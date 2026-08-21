import { supabase } from '../supabase';

const LOGO_BUCKET = 'sponsor-logos';

const mapSponsor = (s) => ({
  id: s.id,
  teamId: s.team_id,
  name: s.name,
  tier: s.tier || '',
  status: s.status || 'prospect',
  contactName: s.contact_name || '',
  email: s.email || '',
  phone: s.phone || '',
  website: s.website || '',
  address: s.address || '',
  committedAmount: Number(s.committed_amount || 0),
  renewalDate: s.renewal_date || null,
  notes: s.notes || '',
  logoPath: s.logo_path || null,
  // Resolved here so every consumer gets a ready <img src> and nothing has to
  // know the bucket exists. Public bucket, so this is a plain synchronous URL.
  logoUrl: s.logo_path ? supabase.storage.from(LOGO_BUCKET).getPublicUrl(s.logo_path).data.publicUrl : null,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

// Only keys actually present are written, so a partial update never blanks a
// field the caller wasn't editing.
const toRow = (s) => {
  const row = {};
  const pairs = [
    ['teamId', 'team_id'],
    ['name', 'name'],
    ['tier', 'tier'],
    ['status', 'status'],
    ['contactName', 'contact_name'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['website', 'website'],
    ['address', 'address'],
    ['notes', 'notes'],
    ['logoPath', 'logo_path'],
  ];
  pairs.forEach(([from, to]) => {
    if (s[from] !== undefined) row[to] = s[from];
  });
  if (s.committedAmount !== undefined) row.committed_amount = Number(s.committedAmount) || 0;
  // An empty date input is '' — Postgres rejects that for a date column.
  if (s.renewalDate !== undefined) row.renewal_date = s.renewalDate || null;
  return row;
};

export const sponsorService = {
  getSponsors: async (teamId) => {
    if (!teamId) return [];
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .eq('team_id', teamId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapSponsor);
  },

  createSponsor: async (sponsorData) => {
    const { data, error } = await supabase.from('sponsors').insert(toRow(sponsorData)).select().single();
    if (error) throw error;
    return mapSponsor(data);
  },

  updateSponsor: async (id, updates) => {
    const { data, error } = await supabase.from('sponsors').update(toRow(updates)).eq('id', id).select().single();
    if (error) throw error;
    return mapSponsor(data);
  },

  deleteSponsor: async (id, logoPath = null) => {
    // Storage first: if the row goes but the object stays, nothing points at
    // the file any more and it can never be cleaned up.
    if (logoPath) await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
    const { error } = await supabase.from('sponsors').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Uploads a logo and points the sponsor row at it. The old object is removed
   * after the row is repointed, so a failed upload leaves the existing logo
   * intact. Path is `${teamId}/${sponsorId}_${timestamp}.${ext}` — the team
   * folder is what the storage policy checks.
   */
  uploadSponsorLogo: async (file, { sponsorId, teamId, previousPath = null }) => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${teamId}/${sponsorId}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadErr) {
      // Storage says only "Bucket not found", which reads as a bug rather than
      // a setup step left undone. Name the fix instead.
      if (/bucket not found/i.test(uploadErr.message || '')) {
        throw new Error(
          `Logo storage isn't set up yet — run sql/sponsors_migration.sql to create the "${LOGO_BUCKET}" bucket.`,
        );
      }
      throw uploadErr;
    }

    const updated = await sponsorService.updateSponsor(sponsorId, { logoPath: path });
    if (previousPath && previousPath !== path) {
      await supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    }
    return updated;
  },

  /**
   * Points ledger entries at a sponsor. Only the link changes — titles, amounts,
   * and dates stay exactly as booked, so a sponsor renamed in the directory
   * leaves the ledger's own history alone.
   */
  linkTransactionsToSponsor: async (sponsorId, txIds) => {
    if (!txIds || txIds.length === 0) return;
    const { error } = await supabase.from('transactions').update({ sponsor_id: sponsorId }).in('id', txIds);
    if (error) throw error;
  },

  unlinkTransactionsFromSponsor: async (txIds) => {
    if (!txIds || txIds.length === 0) return;
    const { error } = await supabase.from('transactions').update({ sponsor_id: null }).in('id', txIds);
    if (error) throw error;
  },

  removeSponsorLogo: async (sponsorId, logoPath) => {
    const updated = await sponsorService.updateSponsor(sponsorId, { logoPath: null });
    if (logoPath) await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
    return updated;
  },
};
