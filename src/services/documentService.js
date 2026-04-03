import { supabase } from '../supabase';

export const documentService = {
  getPlayerDocuments: async (playerId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((d) => ({
      id: d.id,
      playerId: d.player_id,
      clubId: d.club_id,
      teamId: d.team_id,
      seasonId: d.season_id,
      docType: d.doc_type,
      title: d.title,
      fileName: d.file_name,
      filePath: d.file_path,
      fileSize: d.file_size,
      mimeType: d.mime_type,
      status: d.status,
      verifiedBy: d.verified_by,
      verifiedAt: d.verified_at,
      expiresAt: d.expires_at,
      notes: d.notes,
      uploadedBy: d.uploaded_by,
      createdAt: d.created_at,
    }));
  },

  getTeamDocuments: async (teamId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*, players(first_name, last_name, jersey_number)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((d) => ({
      id: d.id,
      playerId: d.player_id,
      playerName: d.players ? `${d.players.first_name} ${d.players.last_name}` : null,
      jerseyNumber: d.players?.jersey_number,
      docType: d.doc_type,
      title: d.title,
      fileName: d.file_name,
      filePath: d.file_path,
      fileSize: d.file_size,
      mimeType: d.mime_type,
      status: d.status,
      expiresAt: d.expires_at,
      createdAt: d.created_at,
    }));
  },

  uploadDocumentRecord: async (docData) => {
    const { error } = await supabase.from('documents').insert({
      player_id: docData.playerId,
      team_id: docData.teamId,
      club_id: docData.clubId,
      season_id: docData.seasonId,
      doc_type: docData.docType,
      title: docData.title,
      file_name: docData.fileName || null,
      file_path: docData.filePath || null,
      mime_type: docData.mimeType || 'text/plain',
      file_size: docData.fileSize || 0,
      status: docData.status || 'uploaded',
      verified_by: docData.verifiedBy || null,
      verified_at: docData.status === 'verified' ? new Date().toISOString() : null,
    });
    if (error) throw error;
  },

  uploadDocument: async (file, playerId, docMeta) => {
    const ext = file.name.split('.').pop();
    const storagePath = `${docMeta.clubId}/${playerId}/${Date.now()}_${docMeta.docType}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('player-documents')
      .upload(storagePath, file, { contentType: file.type });
    if (uploadErr) throw uploadErr;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('documents')
      .insert({
        player_id: playerId,
        club_id: docMeta.clubId || null,
        team_id: docMeta.teamId || null,
        season_id: docMeta.seasonId || null,
        doc_type: docMeta.docType,
        title: docMeta.title || `${docMeta.docType} - ${file.name}`,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  verifyDocument: async (docId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'verified',
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', docId);
    if (error) throw error;
  },

  rejectDocument: async (docId, reason = null) => {
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'rejected',
        notes: reason,
      })
      .eq('id', docId);
    if (error) throw error;
  },

  deleteDocument: async (docId, filePath) => {
    if (filePath) {
      await supabase.storage.from('player-documents').remove([filePath]);
    }
    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;
  },

  getDocumentUrl: async (filePath) => {
    const { data } = await supabase.storage.from('player-documents').createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  },

  getMedicalForm: async (playerId) => {
    if (!playerId) return null;
    const { data, error } = await supabase.from('medical_forms').select('*').eq('player_id', playerId).maybeSingle();
    if (error) throw error;
    return data;
  },

  saveMedicalForm: async (playerId, formData, language = 'en') => {
    const row = {
      player_id: playerId,
      data: formData,
      language,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('medical_forms').upsert(row, { onConflict: 'player_id' });
    if (error) throw error;
  },
};
