import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, FileText, Trash2, CheckCircle2, XCircle, Clock, Eye,
  Search, Filter, ChevronDown, X, Shield, AlertCircle, Download
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { ALL_ROLES } from '../utils/roles';

const DOC_TYPES = [
  { id: 'medical_release', label: 'Medical Release', required: true },
  { id: 'reeplayer_waiver', label: 'ReePlayer Waiver', required: true },
  { id: 'birth_certificate', label: 'Birth Certificate', required: false },
  { id: 'player_photo', label: 'Player Photo', required: false },
  { id: 'parent_id', label: 'Parent ID', required: false },
  { id: 'insurance_card', label: 'Insurance Card', required: false },
  { id: 'roster_form', label: 'Roster Form', required: false },
  { id: 'other', label: 'Other', required: false },
];

const STATUS_COLORS = {
  uploaded: 'bg-blue-100 text-blue-700',
  verified: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function DocumentManager({ 
  players, selectedSeason, club, selectedTeam, formatMoney, showToast, showConfirm, can, PERMISSIONS
}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [uploadingFor, setUploadingFor] = useState(null); // playerId
  const [uploadDocType, setUploadDocType] = useState('medical_release');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const canEdit = can(PERMISSIONS.TEAM_EDIT_ROSTER);

  // Fetch documents scoped to team AND season
  const fetchDocs = async () => {
    setLoading(true);
    try {
      if (selectedTeam) {
        const allDocs = await supabaseService.getTeamDocuments(selectedTeam.id);
        // Filter to current season — show docs that either match the season or have no season set
        const seasonDocs = allDocs.filter(d => 
          !d.seasonId || d.seasonId === selectedSeason
        );
        setDocuments(seasonDocs);
      }
    } catch (e) { console.error('Doc fetch error', e); }
    finally { setLoading(false); }
  };

  // Re-fetch when team OR season changes
  useEffect(() => { fetchDocs(); }, [selectedTeam?.id, selectedSeason]);

  // Per-player compliance (uses only players passed in, which are already season-filtered)
  const playerCompliance = useMemo(() => {
    const map = {};
    players.forEach(p => {
      const playerDocs = documents.filter(d => d.playerId === p.id);
      const hasMedical = playerDocs.some(d => d.docType === 'medical_release' && ['uploaded', 'verified'].includes(d.status));
      const hasReeplayer = playerDocs.some(d => d.docType === 'reeplayer_waiver' && ['uploaded', 'verified'].includes(d.status));
      map[p.id] = { hasMedical, hasReeplayer, isComplete: hasMedical && hasReeplayer, docCount: playerDocs.length, docs: playerDocs };
    });
    return map;
  }, [players, documents]);

  const compliantCount = Object.values(playerCompliance).filter(c => c.isComplete).length;
  const missingMedical = Object.values(playerCompliance).filter(c => !c.hasMedical).length;
  const missingReeplayer = Object.values(playerCompliance).filter(c => !c.hasReeplayer).length;

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingFor) return;
    if (file.size > 10 * 1024 * 1024) { showToast('File too large (max 10MB)', true); return; }

    setIsUploading(true);
    try {
      await supabaseService.uploadDocument(file, uploadingFor, {
        clubId: club?.id, teamId: selectedTeam?.id, seasonId: selectedSeason,
        docType: uploadDocType, title: `${DOC_TYPES.find(t => t.id === uploadDocType)?.label || uploadDocType}`,
      });
      showToast('Document uploaded!');
      setUploadingFor(null);
      fetchDocs();
    } catch (err) {
      showToast(`Upload failed: ${err.message}`, true);
    } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleVerify = async (docId) => {
    await supabaseService.updateDocumentStatus(docId, 'verified');
    showToast('Document verified'); fetchDocs();
  };

  const handleReject = async (docId) => {
    const ok = await showConfirm('Reject this document?');
    if (!ok) return;
    await supabaseService.updateDocumentStatus(docId, 'rejected', 'Rejected by admin');
    showToast('Document rejected'); fetchDocs();
  };

  const handleDelete = async (doc) => {
    const ok = await showConfirm(`Delete "${doc.title}" for ${doc.playerName}?`);
    if (!ok) return;
    await supabaseService.deleteDocument(doc.id, doc.filePath);
    showToast('Document deleted'); fetchDocs();
  };

  const handleView = async (filePath) => {
    try {
      const url = await supabaseService.getDocumentUrl(filePath);
      window.open(url, '_blank');
    } catch (e) { showToast('Failed to open document', true); }
  };

  const filteredPlayers = useMemo(() => {
    let result = players;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
    }
    if (filterStatus === 'missing') result = result.filter(p => !playerCompliance[p.id]?.isComplete);
    if (filterStatus === 'complete') result = result.filter(p => playerCompliance[p.id]?.isComplete);
    return result;
  }, [players, searchTerm, filterStatus, playerCompliance]);

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">Loading documents...</div>;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Documents</h2>
        <p className="text-xs text-slate-400 font-bold">{selectedTeam?.name} · {selectedSeason} · {documents.length} files uploaded</p>
      </div>

      {/* Compliance Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`p-4 rounded-2xl border shadow-sm ${compliantCount === players.length ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <Shield size={16} className={compliantCount === players.length ? 'text-emerald-600' : 'text-amber-600'} />
          <p className="text-xl font-black mt-1">{compliantCount}/{players.length}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Fully Compliant</p>
        </div>
        <div className={`p-4 rounded-2xl border shadow-sm ${missingMedical === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <FileText size={16} className={missingMedical === 0 ? 'text-emerald-600' : 'text-red-600'} />
          <p className="text-xl font-black mt-1">{missingMedical}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Missing Medical</p>
        </div>
        <div className={`p-4 rounded-2xl border shadow-sm ${missingReeplayer === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <FileText size={16} className={missingReeplayer === 0 ? 'text-emerald-600' : 'text-red-600'} />
          <p className="text-xl font-black mt-1">{missingReeplayer}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Missing ReePlayer</p>
        </div>
        <div className="p-4 rounded-2xl border shadow-sm bg-white border-slate-200">
          <Upload size={16} className="text-blue-600" />
          <p className="text-xl font-black mt-1">{documents.length}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Total Documents</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input type="text" placeholder="Search players..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {[{ id: 'all', label: 'All' }, { id: 'missing', label: 'Missing Docs' }, { id: 'complete', label: 'Complete' }].map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterStatus === f.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Player Document List */}
      <div className="space-y-2">
        {filteredPlayers.map(player => {
          const comp = playerCompliance[player.id] || {};
          const isExpanded = uploadingFor === player.id;

          return (
            <div key={player.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${comp.isComplete ? 'border-emerald-200' : 'border-amber-200'}`}>
              <div className="flex items-center gap-3 p-4">
                {/* Jersey */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${comp.isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {player.jerseyNumber || '?'}
                </div>

                {/* Name + compliance badges */}
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-black text-slate-800">{player.firstName} {player.lastName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${comp.hasMedical ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      Medical {comp.hasMedical ? '✓' : '✗'}
                    </span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${comp.hasReeplayer ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      ReePlayer {comp.hasReeplayer ? '✓' : '✗'}
                    </span>
                    {comp.docCount > 0 && <span className="text-[9px] font-bold text-slate-400">{comp.docCount} file{comp.docCount !== 1 && 's'}</span>}
                  </div>
                </div>

                {/* Upload button */}
                {canEdit && (
                  <button onClick={() => setUploadingFor(isExpanded ? null : player.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${isExpanded ? 'bg-slate-200 text-slate-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isExpanded ? <><X size={12} /> Close</> : <><Upload size={12} /> Upload</>}
                  </button>
                )}
              </div>

              {/* Upload Form + Existing Docs */}
              {isExpanded && (
                <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-3">
                  {/* Upload form */}
                  {canEdit && (
                    <div className="flex gap-2 items-end">
                      <div className="flex-grow">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document Type</label>
                        <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none mt-1">
                          {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </div>
                      <label className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black cursor-pointer transition-all ${isUploading ? 'bg-slate-200 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                        <Upload size={14} /> {isUploading ? 'Uploading...' : 'Choose File'}
                        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                          onChange={handleFileSelect} disabled={isUploading} />
                      </label>
                    </div>
                  )}

                  {/* Existing docs for this player */}
                  {comp.docs.length > 0 ? (
                    <div className="space-y-1.5">
                      {comp.docs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-slate-100">
                          <FileText size={16} className="text-slate-400 shrink-0" />
                          <div className="flex-grow min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{doc.title}</p>
                            <p className="text-[10px] text-slate-400">{doc.fileName} · {doc.fileSize ? `${Math.round(doc.fileSize / 1024)}KB` : ''}</p>
                          </div>
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[doc.status]}`}>{doc.status}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleView(doc.filePath)} className="p-1 text-slate-400 hover:text-blue-600" title="View"><Eye size={14} /></button>
                            {canEdit && doc.status === 'uploaded' && (
                              <button onClick={() => handleVerify(doc.id)} className="p-1 text-slate-400 hover:text-emerald-600" title="Verify"><CheckCircle2 size={14} /></button>
                            )}
                            {canEdit && doc.status === 'uploaded' && (
                              <button onClick={() => handleReject(doc.id)} className="p-1 text-slate-400 hover:text-red-600" title="Reject"><XCircle size={14} /></button>
                            )}
                            {canEdit && (
                              <button onClick={() => handleDelete(doc)} className="p-1 text-slate-300 hover:text-red-500" title="Delete"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-2">No documents uploaded yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" />
    </div>
  );
}