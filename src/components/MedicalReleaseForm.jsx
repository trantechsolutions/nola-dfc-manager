import { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Heart,
  Shield,
  Phone,
  MapPin,
  User,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Globe,
} from 'lucide-react';
import { generateMedicalPdf } from '../utils/generateMedicalPdf';
import supabaseService from '../services/supabaseService';
import { useT } from '../i18n/I18nContext';

const EMPTY_FORM = {
  playerName: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  guardian1Name: '',
  guardian1HomePhone: '',
  guardian1WorkPhone: '',
  guardian2Name: '',
  guardian2HomePhone: '',
  guardian2WorkPhone: '',
  emergency1Name: '',
  emergency1HomePhone: '',
  emergency1WorkPhone: '',
  emergency2Name: '',
  emergency2HomePhone: '',
  emergency2WorkPhone: '',
  allergies: '',
  medicalConditions: '',
  physician: '',
  physicianPhone: '',
  insuranceCompany: '',
  insurancePhone: '',
  policyHolder: '',
  policyNumber: '',
  groupNumber: '',
  signatureName: '',
  signatureDate: '',
};

/**
 * MedicalReleaseForm — digital form that generates and uploads a PDF.
 *
 * Props:
 *   show          – boolean
 *   onClose       – () => void
 *   player        – { id, firstName, lastName, teamId, guardians, ... }
 *   clubId        – string (for storage path)
 *   seasonId      – string (optional, for doc metadata)
 *   onCompleted   – () => void  (called after successful save)
 */
export default function MedicalReleaseForm({ show, onClose, player, clubId, seasonId, onCompleted }) {
  const { locale } = useT();
  const [lang, setLang] = useState(locale);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingForm, setExistingForm] = useState(null);
  const [error, setError] = useState(null);

  // Load existing form data or pre-fill from player/guardians
  useEffect(() => {
    if (!show || !player) return;
    setLoading(true);
    setError(null);

    supabaseService
      .getMedicalForm(player.id)
      .then((existing) => {
        if (existing) {
          setFormData({ ...EMPTY_FORM, ...existing.data });
          setLang(existing.language || 'en');
          setExistingForm(existing);
        } else {
          // Pre-fill from player data
          const g1 = player.guardians?.[0] || {};
          const g2 = player.guardians?.[1] || {};
          setFormData({
            ...EMPTY_FORM,
            playerName: `${player.firstName || ''} ${player.lastName || ''}`.trim(),
            guardian1Name: g1.name || '',
            guardian1HomePhone: g1.phone || '',
            guardian2Name: g2.name || '',
            guardian2HomePhone: g2.phone || '',
            signatureDate: new Date().toISOString().split('T')[0],
          });
          setExistingForm(null);
        }
      })
      .catch(() => {
        setExistingForm(null);
      })
      .finally(() => setLoading(false));
  }, [show, player]);

  if (!show || !player) return null;

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.signatureName) {
      setError('Please type your full name as a digital signature.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // 1. Save form data to DB
      await supabaseService.saveMedicalForm(player.id, formData, lang);

      // 2. Remove any existing medical_release documents (overwrite, not stack)
      try {
        const existingDocs = await supabaseService.getPlayerDocuments(player.id);
        const oldMedical = existingDocs.filter((d) => d.docType === 'medical_release');
        for (const doc of oldMedical) {
          await supabaseService.deleteDocument(doc.id, doc.filePath);
        }
      } catch {
        /* continue even if cleanup fails */
      }

      // 3. Generate PDF (async — loads template PDF if available)
      const pdfBlob = await generateMedicalPdf(formData, lang);
      const fileName = `Medical_Release_${player.firstName}_${player.lastName}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // 4. Upload as document (triggers compliance tracking)
      await supabaseService.uploadDocument(pdfFile, player.id, {
        clubId: clubId || player.clubId,
        teamId: player.teamId,
        seasonId,
        docType: 'medical_release',
        title: `Medical Release - ${player.firstName} ${player.lastName}`,
      });

      // 5. Mark player compliance
      await supabaseService.updatePlayerField(player.id, 'medical_release', true);

      onCompleted?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const labels = lang === 'es' ? ES : EN;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-start p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-none w-full max-w-2xl my-4 overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-70">US Youth Soccer</p>
            <h3 className="font-bold text-lg leading-tight">{labels.title}</h3>
            <p className="text-xs opacity-80 mt-0.5">
              {player.firstName} {player.lastName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'en' ? 'es' : 'en'))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold transition-colors"
              title="Toggle language"
            >
              <Globe size={12} />
              {lang === 'en' ? 'ES' : 'EN'}
            </button>
            <button onClick={onClose} className="text-white/60 hover:text-white font-bold text-xl ml-2">
              &times;
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {existingForm && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-sm text-emerald-700 font-medium">
                <CheckCircle2 size={16} />
                <div>
                  <span>{labels.alreadyCompleted}</span>
                  {(existingForm.completed_at || existingForm.updated_at) && (
                    <span className="block text-[10px] text-emerald-500 font-bold mt-0.5">
                      {labels.completedOn}{' '}
                      {new Date(existingForm.completed_at || existingForm.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Player Information ── */}
            <Section icon={User} title={labels.playerInfo} color="blue">
              <Input
                label={labels.playerName}
                value={formData.playerName}
                onChange={(v) => set('playerName', v)}
                required
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label={labels.dob}
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(v) => set('dateOfBirth', v)}
                  required
                />
                <Input
                  label={labels.gender}
                  value={formData.gender}
                  onChange={(v) => set('gender', v)}
                  options={['Male', 'Female']}
                />
                <div />
              </div>
              <Input label={labels.address} value={formData.address} onChange={(v) => set('address', v)} />
              <div className="grid grid-cols-3 gap-3">
                <Input label={labels.city} value={formData.city} onChange={(v) => set('city', v)} />
                <Input label={labels.state} value={formData.state} onChange={(v) => set('state', v)} />
                <Input label={labels.zip} value={formData.zip} onChange={(v) => set('zip', v)} />
              </div>
            </Section>

            {/* ── Emergency Information ── */}
            <Section icon={Phone} title={labels.emergencyInfo} color="amber">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{labels.guardian} 1</p>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label={labels.name}
                  value={formData.guardian1Name}
                  onChange={(v) => set('guardian1Name', v)}
                  required
                />
                <Input
                  label={labels.homePhone}
                  type="tel"
                  value={formData.guardian1HomePhone}
                  onChange={(v) => set('guardian1HomePhone', v)}
                  required
                />
                <Input
                  label={labels.workPhone}
                  type="tel"
                  value={formData.guardian1WorkPhone}
                  onChange={(v) => set('guardian1WorkPhone', v)}
                />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">{labels.guardian} 2</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label={labels.name} value={formData.guardian2Name} onChange={(v) => set('guardian2Name', v)} />
                <Input
                  label={labels.homePhone}
                  type="tel"
                  value={formData.guardian2HomePhone}
                  onChange={(v) => set('guardian2HomePhone', v)}
                />
                <Input
                  label={labels.workPhone}
                  type="tel"
                  value={formData.guardian2WorkPhone}
                  onChange={(v) => set('guardian2WorkPhone', v)}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-400 italic mb-2">{labels.emergencyNote}</p>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    label={labels.name}
                    value={formData.emergency1Name}
                    onChange={(v) => set('emergency1Name', v)}
                  />
                  <Input
                    label={labels.homePhone}
                    type="tel"
                    value={formData.emergency1HomePhone}
                    onChange={(v) => set('emergency1HomePhone', v)}
                  />
                  <Input
                    label={labels.workPhone}
                    type="tel"
                    value={formData.emergency1WorkPhone}
                    onChange={(v) => set('emergency1WorkPhone', v)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <Input
                    label={labels.name}
                    value={formData.emergency2Name}
                    onChange={(v) => set('emergency2Name', v)}
                  />
                  <Input
                    label={labels.homePhone}
                    type="tel"
                    value={formData.emergency2HomePhone}
                    onChange={(v) => set('emergency2HomePhone', v)}
                  />
                  <Input
                    label={labels.workPhone}
                    type="tel"
                    value={formData.emergency2WorkPhone}
                    onChange={(v) => set('emergency2WorkPhone', v)}
                  />
                </div>
              </div>
            </Section>

            {/* ── Medical Information ── */}
            <Section icon={Heart} title={labels.medicalInfo} color="red">
              <Input
                label={labels.allergies}
                value={formData.allergies}
                onChange={(v) => set('allergies', v)}
                placeholder={labels.allergiesPlaceholder}
              />
              <Input
                label={labels.conditions}
                value={formData.medicalConditions}
                onChange={(v) => set('medicalConditions', v)}
                placeholder={labels.conditionsPlaceholder}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label={labels.physician} value={formData.physician} onChange={(v) => set('physician', v)} />
                <Input
                  label={labels.officePhone}
                  type="tel"
                  value={formData.physicianPhone}
                  onChange={(v) => set('physicianPhone', v)}
                />
              </div>
            </Section>

            {/* ── Insurance Information ── */}
            <Section icon={Shield} title={labels.insuranceInfo} color="violet">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={labels.insuranceCo}
                  value={formData.insuranceCompany}
                  onChange={(v) => set('insuranceCompany', v)}
                />
                <Input
                  label={labels.phone}
                  type="tel"
                  value={formData.insurancePhone}
                  onChange={(v) => set('insurancePhone', v)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label={labels.policyHolder}
                  value={formData.policyHolder}
                  onChange={(v) => set('policyHolder', v)}
                />
                <Input
                  label={labels.policyNum}
                  value={formData.policyNumber}
                  onChange={(v) => set('policyNumber', v)}
                />
                <Input label={labels.groupNum} value={formData.groupNumber} onChange={(v) => set('groupNumber', v)} />
              </div>
              <p className="text-[10px] text-slate-400 font-bold text-center mt-1">{labels.insuranceNote}</p>
            </Section>

            {/* ── Consent & Signature ── */}
            <Section icon={FileText} title={labels.consentTitle} color="slate">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 max-h-36 overflow-y-auto text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {labels.consentBody}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {labels.signatureLabel} *
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.signatureName}
                    onChange={(e) => set('signatureName', e.target.value)}
                    className="w-full border-b-2 border-slate-900 dark:border-slate-400 bg-transparent p-2 text-lg font-serif italic focus:border-red-600 outline-none dark:text-white"
                    placeholder={labels.signaturePlaceholder}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {labels.dateLabel} *
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.signatureDate}
                    onChange={(e) => set('signatureDate', e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </Section>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700 font-medium">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {labels.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {saving ? labels.saving : existingForm ? labels.updateBtn : labels.submitBtn}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Reusable form input ──────────────────────────────────

function Input({ label, value, onChange, type = 'text', required = false, placeholder = '', options = null }) {
  if (options) {
    return (
      <div>
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
          {label}
          {required && ' *'}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 dark:text-white"
        >
          <option value="">--</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
        {label}
        {required && ' *'}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-sm focus:ring-2 focus:ring-red-500 outline-none dark:bg-slate-800 dark:text-white"
      />
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────

const SECTION_COLORS = {
  blue: 'border-blue-200 bg-blue-50/30',
  amber: 'border-amber-200 bg-amber-50/30',
  red: 'border-red-200 bg-red-50/30',
  violet: 'border-violet-200 bg-violet-50/30',
  slate: 'border-slate-200 bg-slate-50/30',
};

function Section({ icon: Icon, title, color, children }) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${SECTION_COLORS[color] || SECTION_COLORS.slate}`}>
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
        <Icon size={14} className="text-slate-400" /> {title}
      </h4>
      {children}
    </div>
  );
}

// ── Label strings ────────────────────────────────────────

const EN = {
  title: 'Medical Release Form',
  playerInfo: 'Player Information',
  playerName: "Player's Name",
  dob: 'Date of Birth',
  gender: 'Gender',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip: 'Zip',
  emergencyInfo: 'Emergency Information',
  guardian: 'Parent/Guardian',
  homePhone: 'Home Phone',
  workPhone: 'Work Phone',
  emergencyNote: 'In an emergency, when parents/guardians cannot be reached, please contact:',
  name: 'Full Name',
  medicalInfo: 'Medical Information',
  allergies: 'Allergies',
  allergiesPlaceholder: 'List any known allergies...',
  conditions: 'Other Medical Conditions',
  conditionsPlaceholder: 'List any medical conditions...',
  physician: "Player's Physician",
  officePhone: 'Office Phone',
  insuranceInfo: 'Insurance Information',
  insuranceCo: 'Insurance Company',
  phone: 'Phone',
  policyHolder: 'Policy Holder',
  policyNum: 'Policy #',
  groupNum: 'Group #',
  insuranceNote: 'Please copy both sides of your health insurance card and attach to this form.',
  consentTitle: 'Consent & Signature',
  consentBody:
    'Recognizing the possibility of injury or illness, and in consideration for US Youth Soccer and members of US Youth Soccer accepting my son/daughter as a player in the soccer programs and activities of US Youth Soccer and its members (the "Programs"), I consent to my son/daughter participating in the Programs. Further, I hereby release, discharge, and otherwise indemnify US Youth Soccer, its member organizations and sponsors, their employees, associated personnel, and volunteers, including the owner of fields and facilities utilized for the Programs, against any claim by or on behalf of my player son/daughter as a result of my son\'s/daughter\'s participation in the Programs and/or being transported to or from the Programs. I hereby authorize the transportation of my son/daughter to or from the Programs. My player son/daughter has received a physical examination by a licensed medical doctor and has been found physically capable of participating in the sport of soccer. I give my consent to have an athletic trainer and/or licensed medical doctor or dentist provide my son/daughter with medical assistance and/or treatment and agree to be financially responsible for the reasonable cost of any such assistance and/or treatment.',
  signatureLabel: 'Signature (type full name)',
  signaturePlaceholder: 'Type your full name...',
  dateLabel: 'Date',
  cancel: 'Cancel',
  saving: 'Saving...',
  submitBtn: 'Sign & Submit',
  updateBtn: 'Update & Re-sign',
  alreadyCompleted: 'This form was previously completed. You may update it below.',
  completedOn: 'Last submitted:',
};

const ES = {
  title: 'Formulario de Alta Médica',
  playerInfo: 'Información del Jugador',
  playerName: 'Nombre del Jugador',
  dob: 'Fecha de Nacimiento',
  gender: 'Género',
  address: 'Dirección',
  city: 'Ciudad',
  state: 'Estado',
  zip: 'Código Postal',
  emergencyInfo: 'Información de Emergencia',
  guardian: 'Padre/Tutor',
  homePhone: 'Teléfono',
  workPhone: 'Tel. del Trabajo',
  emergencyNote: 'En caso de emergencia, cuando los padres no se puedan contactar, por favor comunicarse con:',
  name: 'Nombre Completo',
  medicalInfo: 'Información Médica',
  allergies: 'Alergias',
  allergiesPlaceholder: 'Liste las alergias conocidas...',
  conditions: 'Condición Médica',
  conditionsPlaceholder: 'Liste las condiciones médicas...',
  physician: 'Doctor del Jugador',
  officePhone: 'Teléfono',
  insuranceInfo: 'Información de Seguro Médico',
  insuranceCo: 'Compañía de Seguro',
  phone: 'Teléfono',
  policyHolder: 'Titular de la Póliza',
  policyNum: 'Póliza #',
  groupNum: 'Grupo #',
  insuranceNote: 'Por favor hacer copia de ambos lados de la tarjeta de su seguro médico y adjuntar.',
  consentTitle: 'Consentimiento y Firma',
  consentBody:
    'Reconociendo la posibilidad de lesión o enfermedad y en consideración de US Youth Soccer y los miembros de US Youth Soccer aceptando a mi hijo/hija como jugador en los programas de fútbol y actividades de US Youth Soccer y sus miembros (los "Programas"), autorizo a mi hijo/hija a participar en los Programas. Además, liberar por este medio, la descarga y de lo contrario indemnizar a US Youth Soccer, sus organizaciones miembros y patrocinadores, sus empleados, personal asociado y voluntarios, incluyendo el propietario de campos e instalaciones utilizadas para los Programas, contra cualquier reclamo por o en nombre de mi hijo/hija jugador. Doy mi consentimiento para que un entrenador deportivo o médico con licencia o dentista proporcione asistencia médica o tratamiento a mi hijo/hija y acepta ser financieramente responsable por el costo razonable de tal asistencia o tratamiento.',
  signatureLabel: 'Firma (escriba su nombre completo)',
  signaturePlaceholder: 'Escriba su nombre completo...',
  dateLabel: 'Fecha',
  cancel: 'Cancelar',
  saving: 'Guardando...',
  submitBtn: 'Firmar y Enviar',
  updateBtn: 'Actualizar y Firmar',
  alreadyCompleted: 'Este formulario fue completado anteriormente. Puede actualizarlo abajo.',
  completedOn: 'Última presentación:',
};
