import { supabase } from '../supabase';

const mapContact = (c) => ({
  id: c.id,
  teamId: c.team_id,
  clubName: c.club_name,
  contactName: c.contact_name,
  email: c.email,
  phone: c.phone,
  notes: c.notes,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

const toRow = (c) => ({
  ...(c.teamId !== undefined ? { team_id: c.teamId } : {}),
  ...(c.clubName !== undefined ? { club_name: c.clubName } : {}),
  ...(c.contactName !== undefined ? { contact_name: c.contactName } : {}),
  ...(c.email !== undefined ? { email: c.email } : {}),
  ...(c.phone !== undefined ? { phone: c.phone } : {}),
  ...(c.notes !== undefined ? { notes: c.notes } : {}),
});

export const opponentContactService = {
  getOpponentContacts: async (teamId) => {
    if (!teamId) return [];
    const { data, error } = await supabase
      .from('opponent_contacts')
      .select('*')
      .eq('team_id', teamId)
      .order('club_name', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapContact);
  },

  createOpponentContact: async (contactData) => {
    const { data, error } = await supabase.from('opponent_contacts').insert(toRow(contactData)).select().single();
    if (error) throw error;
    return mapContact(data);
  },

  updateOpponentContact: async (id, updates) => {
    const { data, error } = await supabase
      .from('opponent_contacts')
      .update(toRow(updates))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapContact(data);
  },

  deleteOpponentContact: async (id) => {
    const { error } = await supabase.from('opponent_contacts').delete().eq('id', id);
    if (error) throw error;
  },
};
