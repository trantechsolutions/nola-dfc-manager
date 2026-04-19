import { supabase } from '../supabase';

export const rubricService = {
  getTeamRubric: async (teamId) => {
    if (!teamId) return null;
    const { data, error } = await supabase
      .from('team_evaluation_rubrics')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      teamId: data.team_id,
      sections: data.sections || [],
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  },

  saveTeamRubric: async ({ teamId, sections, updatedBy }) => {
    const { data, error } = await supabase
      .from('team_evaluation_rubrics')
      .upsert(
        {
          team_id: teamId,
          sections: sections || [],
          updated_at: new Date().toISOString(),
          updated_by: updatedBy || null,
        },
        { onConflict: 'team_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteTeamRubric: async (teamId) => {
    const { error } = await supabase.from('team_evaluation_rubrics').delete().eq('team_id', teamId);
    if (error) throw error;
  },
};
