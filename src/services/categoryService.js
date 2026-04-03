import { supabase } from '../supabase';

export const categoryService = {
  getCustomCategories: async (clubId) => {
    const { data, error } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('club_id', clubId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map((c) => ({
      id: c.id,
      clubId: c.club_id,
      code: c.code,
      label: c.label,
      description: c.description || '',
      color: c.color,
      flow: c.flow || 'expense',
      sortOrder: c.sort_order || 0,
    }));
  },

  addCustomCategory: async (catData) => {
    const row = {
      club_id: catData.clubId,
      code: catData.code,
      label: catData.label,
      description: catData.description || null,
      color: catData.color,
      flow: catData.flow || 'expense',
      sort_order: catData.sortOrder || 0,
    };
    const { data, error } = await supabase.from('custom_categories').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  updateCustomCategory: async (catId, catData) => {
    const updates = {};
    if ('label' in catData) updates.label = catData.label;
    if ('description' in catData) updates.description = catData.description || null;
    if ('color' in catData) updates.color = catData.color;
    if ('flow' in catData) updates.flow = catData.flow;
    if ('sortOrder' in catData) updates.sort_order = catData.sortOrder;
    const { error } = await supabase.from('custom_categories').update(updates).eq('id', catId);
    if (error) throw error;
  },

  deleteCustomCategory: async (catId) => {
    const { error } = await supabase.from('custom_categories').delete().eq('id', catId);
    if (error) throw error;
  },
};
