// ── Document Types ──────────────────────────────────────────
export const DOC_TYPE_LABELS = {
  medical_release: 'Medical Release',
  reeplayer_waiver: 'ReePlayer Waiver',
  birth_certificate: 'Birth Certificate',
  player_photo: 'Player Photo',
  parent_id: 'Parent ID',
  insurance_card: 'Insurance Card',
  roster_form: 'Roster Form',
  other: 'Other',
};

export const DOC_TYPES = [
  { id: 'medical_release', label: 'Medical Release', required: true },
  { id: 'reeplayer_waiver', label: 'ReePlayer Waiver', required: false },
  { id: 'birth_certificate', label: 'Birth Certificate', required: false },
  { id: 'player_photo', label: 'Player Photo', required: false },
  { id: 'parent_id', label: 'Parent ID', required: false },
  { id: 'insurance_card', label: 'Insurance Card', required: false },
  { id: 'roster_form', label: 'Roster Form', required: false },
  { id: 'other', label: 'Other', required: false },
];

export const DOC_STATUS_COLORS = {
  uploaded: 'bg-blue-100 text-blue-700',
  verified: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

// ── Category Labels (static fallback — prefer i18n via CategoryManager) ──
export const CATEGORY_LABELS = {
  TMF: 'Team Fee',
  SPO: 'Sponsorship',
  FUN: 'Fundraising',
  CRE: 'Credit',
  OPE: 'Operating',
  TOU: 'Tournament',
  LEA: 'League/Refs',
  FRI: 'Friendlies',
  TRF: 'Transfer',
};

export const CATEGORY_TEXT_COLORS = {
  TMF: 'text-blue-600',
  SPO: 'text-violet-600',
  FUN: 'text-emerald-600',
  CRE: 'text-cyan-600',
  OPE: 'text-slate-500',
  TOU: 'text-amber-600',
  LEA: 'text-orange-600',
  FRI: 'text-rose-600',
  TRF: 'text-indigo-600',
};
