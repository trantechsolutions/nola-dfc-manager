// Dynamic import to keep pdf-lib out of the main bundle

/**
 * Generate a filled US Youth Soccer Medical Release PDF.
 *
 * The official template PDFs contain named form fields (AcroForm).
 * We load the template, fill every field by name, flatten the form
 * so it's no longer editable, and return the result as a Blob.
 *
 * Templates expected at:
 *   /templates/medical_release_form.pdf              (English – 30 fields)
 *   /templates/medical_release_form_-_spanish-1.pdf  (Spanish – 28 fields)
 *
 * @param {object} data  – form field values from MedicalReleaseForm
 * @param {'en'|'es'} lang
 * @returns {Promise<Blob>}
 */
export async function generateMedicalPdf(data, lang = 'en') {
  const base = import.meta.env.BASE_URL || '/';
  const templatePath =
    lang === 'es'
      ? `${base}templates/medical_release_form_-_spanish-1.pdf`
      : `${base}templates/medical_release_form.pdf`;

  try {
    const resp = await fetch(templatePath);
    if (!resp.ok) throw new Error('Template not found');
    const templateBytes = await resp.arrayBuffer();
    return await fillFormFields(templateBytes, data, lang);
  } catch {
    // Fallback: generate standalone PDF if template missing
    const { jsPDF } = await import('jspdf');
    return generateFallbackPdf(jsPDF, data, lang);
  }
}

// ════════════════════════════════════════════════════════════
// FORM FIELD FILLING  (pdf-lib AcroForm)
// ════════════════════════════════════════════════════════════

/**
 * Maps our form data keys → PDF form field names.
 *
 * English template fields (30):
 *   Players Name, Date of Birth, Gender, Address, City, State, Zip,
 *   undefined (Guardian1 Name), Home Phone, Work Phone,
 *   undefined_2 (Guardian2 Name), Home Phone_2, Work Phone_2,
 *   Name (Emergency1), Home Phone_3, Work Phone_3,
 *   Name_2 (Emergency2), Home Phone_4, Work Phone_4,
 *   Allergies, Other Medical Conditions, Players Physician, Office Phone,
 *   Medical andor Hospital Insurance Company, Phone,
 *   Policy Holder, Policy, Group,
 *   Date, Signature1_es_:signer:signature
 */
const EN_FIELD_MAP = {
  playerName: 'Players Name',
  dateOfBirth: 'Date of Birth',
  gender: 'Gender',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip: 'Zip',
  guardian1Name: 'undefined',
  guardian1HomePhone: 'Home Phone',
  guardian1WorkPhone: 'Work Phone',
  guardian2Name: 'undefined_2',
  guardian2HomePhone: 'Home Phone_2',
  guardian2WorkPhone: 'Work Phone_2',
  emergency1Name: 'Name',
  emergency1HomePhone: 'Home Phone_3',
  emergency1WorkPhone: 'Work Phone_3',
  emergency2Name: 'Name_2',
  emergency2HomePhone: 'Home Phone_4',
  emergency2WorkPhone: 'Work Phone_4',
  allergies: 'Allergies',
  medicalConditions: 'Other Medical Conditions',
  physician: 'Players Physician',
  physicianPhone: 'Office Phone',
  insuranceCompany: 'Medical andor Hospital Insurance Company',
  insurancePhone: 'Phone',
  policyHolder: 'Policy Holder',
  policyNumber: 'Policy',
  groupNumber: 'Group',
  signatureDate: 'Date',
  signatureName: 'Signature1_es_:signer:signature',
};

/**
 * Spanish template fields (28):
 *   Nombre del Jugador, Fecha de Nacimiento, Género, Dirección,
 *   Ciudad, Estado, Código Postal,
 *   Teléfono (G1 Phone), Tel Del Trabajo (G1 Work),
 *   Teléfono_2 (G2 Phone), Tel Del Trabajo_2 (G2 Work),
 *   Nombre (Emergency1), Teléfono_3, Tel Del Trabajo_3,
 *   Nombre_2 (Emergency2), Teléfono_4, Tel Del Trabajo_4,
 *   Alergias, Condición médica, Doctor del Jugador, Teléfono_5,
 *   Compañía de Seguro Médico, Teléfono_6,
 *   Titular de la Póliza, Póliza, Grupo,
 *   Firma del padre o tutor, Fecha
 *
 * Note: Spanish template has no separate guardian Name fields —
 * guardian names may need to go into the phone fields or be
 * handled differently. We map what we can.
 */
const ES_FIELD_MAP = {
  playerName: 'Nombre del Jugador',
  dateOfBirth: 'Fecha de Nacimiento',
  gender: 'Género',
  address: 'Dirección',
  city: 'Ciudad',
  state: 'Estado',
  zip: 'Código Postal',
  guardian1HomePhone: 'Teléfono',
  guardian1WorkPhone: 'Tel Del Trabajo',
  guardian2HomePhone: 'Teléfono_2',
  guardian2WorkPhone: 'Tel Del Trabajo_2',
  emergency1Name: 'Nombre',
  emergency1HomePhone: 'Teléfono_3',
  emergency1WorkPhone: 'Tel Del Trabajo_3',
  emergency2Name: 'Nombre_2',
  emergency2HomePhone: 'Teléfono_4',
  emergency2WorkPhone: 'Tel Del Trabajo_4',
  allergies: 'Alergias',
  medicalConditions: 'Condición médica',
  physician: 'Doctor del Jugador',
  physicianPhone: 'Teléfono_5',
  insuranceCompany: 'Compañía de Seguro Médico',
  insurancePhone: 'Teléfono_6',
  policyHolder: 'Titular de la Póliza',
  policyNumber: 'Póliza',
  groupNumber: 'Grupo',
  signatureName: 'Firma del padre o tutor',
  signatureDate: 'Fecha',
};

async function fillFormFields(templateBytes, data, lang) {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const fieldMap = lang === 'es' ? ES_FIELD_MAP : EN_FIELD_MAP;

  for (const [dataKey, pdfFieldName] of Object.entries(fieldMap)) {
    const value = data[dataKey];
    if (!value) continue;
    try {
      const field = form.getTextField(pdfFieldName);
      field.setText(String(value));
    } catch {
      // Field not found in this template version — skip silently
    }
  }

  // Flatten so the form is no longer editable (looks like a printed form)
  form.flatten();

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

// ════════════════════════════════════════════════════════════
// FALLBACK GENERATOR  (jsPDF – used when template PDF missing)
// ════════════════════════════════════════════════════════════

function generateFallbackPdf(jsPDF, data, lang) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 50;
  const contentW = W - margin * 2;
  let y = 50;
  const labels = lang === 'es' ? ES_LABELS : EN_LABELS;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('US YOUTH SOCCER', W / 2, y, { align: 'center' });
  y += 18;
  doc.setFontSize(11);
  doc.text(labels.title, W / 2, y, { align: 'center' });
  y += 28;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.playerInfo, margin, y);
  y += 4;
  doc.setDrawColor(180);
  doc.line(margin, y, W - margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  y = fieldRow(doc, labels.playerName, data.playerName, margin, y, contentW);
  y = splitRow(
    doc,
    [
      [labels.dob, data.dateOfBirth],
      [labels.gender, data.gender],
    ],
    margin,
    y,
    contentW,
  );
  y = fieldRow(doc, labels.address, data.address, margin, y, contentW);
  y = splitRow(
    doc,
    [
      [labels.city, data.city],
      [labels.state, data.state],
      [labels.zip, data.zip],
    ],
    margin,
    y,
    contentW,
  );
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text(labels.emergencyInfo, margin, y);
  y += 4;
  doc.line(margin, y, W - margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  y = splitRow(
    doc,
    [
      [`${labels.guardian} 1: ${data.guardian1Name || ''}`, ''],
      [labels.homePhone, data.guardian1HomePhone],
      [labels.workPhone, data.guardian1WorkPhone],
    ],
    margin,
    y,
    contentW,
  );
  y = splitRow(
    doc,
    [
      [`${labels.guardian} 2: ${data.guardian2Name || ''}`, ''],
      [labels.homePhone, data.guardian2HomePhone],
      [labels.workPhone, data.guardian2WorkPhone],
    ],
    margin,
    y,
    contentW,
  );
  y += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(labels.emergencyNote, margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y = splitRow(
    doc,
    [
      [labels.name, data.emergency1Name],
      [labels.homePhone, data.emergency1HomePhone],
      [labels.workPhone, data.emergency1WorkPhone],
    ],
    margin,
    y,
    contentW,
  );
  y = splitRow(
    doc,
    [
      [labels.name, data.emergency2Name],
      [labels.homePhone, data.emergency2HomePhone],
      [labels.workPhone, data.emergency2WorkPhone],
    ],
    margin,
    y,
    contentW,
  );
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text(labels.medicalInfo, margin, y);
  y += 4;
  doc.line(margin, y, W - margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  y = fieldRow(doc, labels.allergies, data.allergies, margin, y, contentW);
  y = fieldRow(doc, labels.conditions, data.medicalConditions, margin, y, contentW);
  y = splitRow(
    doc,
    [
      [labels.physician, data.physician],
      [labels.officePhone, data.physicianPhone],
    ],
    margin,
    y,
    contentW,
  );
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text(labels.insuranceInfo, margin, y);
  y += 4;
  doc.line(margin, y, W - margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  y = splitRow(
    doc,
    [
      [labels.insuranceCo, data.insuranceCompany],
      [labels.phone, data.insurancePhone],
    ],
    margin,
    y,
    contentW,
  );
  y = splitRow(
    doc,
    [
      [labels.policyHolder, data.policyHolder],
      [labels.policyNum, data.policyNumber],
      [labels.groupNum, data.groupNumber],
    ],
    margin,
    y,
    contentW,
  );
  y += 8;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.insuranceNote, W / 2, y, { align: 'center', maxWidth: contentW });
  y += 20;
  doc.setFontSize(10);
  doc.text(labels.consentTitle, W / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(labels.consentBody, contentW);
  doc.text(lines, margin, y);
  y += lines.length * 9 + 12;

  if (y > 680) {
    doc.addPage();
    y = 50;
  }
  doc.setDrawColor(0);
  doc.line(margin, y, margin + 280, y);
  doc.line(W - margin - 160, y, W - margin, y);
  y += 12;
  doc.setFontSize(8);
  doc.text(labels.signatureLabel, margin, y);
  doc.text(labels.dateLabel, W - margin - 160, y);
  y -= 20;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  if (data.signatureName) doc.text(data.signatureName, margin + 4, y);
  if (data.signatureDate) doc.text(data.signatureDate, W - margin - 156, y);

  return doc.output('blob');
}

function fieldRow(doc, label, value, x, y, w) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(label + ':', x, y);
  const lw = doc.getTextWidth(label + ': ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(value || '', x + lw + 2, y);
  doc.setDrawColor(200);
  doc.line(x + lw + 2, y + 2, x + w, y + 2);
  return y + 16;
}

function splitRow(doc, fields, x, y, totalW) {
  const colW = totalW / fields.length;
  fields.forEach(([label, value], i) => {
    const cx = x + i * colW;
    if (value !== undefined && value !== '') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(label + ':', cx, y);
      const lw = doc.getTextWidth(label + ': ');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(value || '', cx + lw + 2, y);
      doc.setDrawColor(200);
      doc.line(cx + lw + 2, y + 2, cx + colW - 6, y + 2);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(label, cx, y);
    }
  });
  return y + 16;
}

const EN_LABELS = {
  title: 'PARENT/GUARDIAN CONSENT AND PLAYER MEDICAL RELEASE FORM',
  playerInfo: 'PLAYER INFORMATION',
  playerName: "Player's Name",
  dob: 'Date of Birth',
  gender: 'Gender',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip: 'Zip',
  emergencyInfo: 'EMERGENCY INFORMATION',
  guardian: 'Parent/Guardian',
  homePhone: 'Home Phone',
  workPhone: 'Work Phone',
  emergencyNote: 'In an emergency, when parents/guardians cannot be reached, please contact:',
  name: 'Name',
  medicalInfo: 'MEDICAL INFORMATION',
  allergies: 'Allergies',
  conditions: 'Other Medical Conditions',
  physician: "Player's Physician",
  officePhone: 'Office Phone',
  insuranceInfo: 'INSURANCE INFORMATION',
  insuranceCo: 'Insurance Company',
  phone: 'Phone',
  policyHolder: 'Policy Holder',
  policyNum: 'Policy #',
  groupNum: 'Group #',
  insuranceNote: 'PLEASE COPY BOTH SIDES OF YOUR HEALTH INSURANCE CARD AND ATTACH TO THIS FORM',
  consentTitle: 'PARENT/GUARDIAN CONSENT AND MEDICAL RELEASE',
  consentBody:
    "Recognizing the possibility of injury or illness, and in consideration for US Youth Soccer and members of US Youth Soccer accepting my son/daughter as a player in the soccer programs and activities of US Youth Soccer and its members (the \"Programs\"), I consent to my son/daughter participating in the Programs. Further, I hereby release, discharge, and otherwise indemnify US Youth Soccer, its member organizations and sponsors, their employees, associated personnel, and volunteers, including the owner of fields and facilities utilized for the Programs, against any claim by or on behalf of my player son/daughter as a result of my son's/daughter's participation in the Programs and/or being transported to or from the Programs. I hereby authorize the transportation of my son/daughter to or from the Programs.\n\nMy player son/daughter has received a physical examination by a licensed medical doctor and has been found physically capable of participating in the sport of soccer. I have provided written notice, which is submitted in conjunction with this release and attached hereto, setting forth any specific issue, condition, or ailment, in addition to what is specified above, that my child has or that may impact my child's participation in the Programs. I give my consent to have an athletic trainer and/or licensed medical doctor or dentist provide my son/daughter with medical assistance and/or treatment and agree to be financially responsible for the reasonable cost of any such assistance and/or treatment.",
  signatureLabel: 'Signature of Parent/Guardian',
  dateLabel: 'Date',
};

const ES_LABELS = {
  title: 'CONSENTIMIENTO DE PADRES Y FORMULARIO DE ALTA MÉDICA PARA JUGADORES',
  playerInfo: 'INFORMACIÓN DEL JUGADOR',
  playerName: 'Nombre del Jugador',
  dob: 'Fecha de Nacimiento',
  gender: 'Género',
  address: 'Dirección',
  city: 'Ciudad',
  state: 'Estado',
  zip: 'Código Postal',
  emergencyInfo: 'INFORMACIÓN EN CASO DE EMERGENCIA',
  guardian: 'Padre/Tutor',
  homePhone: 'Teléfono',
  workPhone: 'Tel. Del Trabajo',
  emergencyNote: 'En caso de emergencia, cuando los padres no se puedan contactar, por favor comunicarse con:',
  name: 'Nombre',
  medicalInfo: 'INFORMACIÓN MÉDICA',
  allergies: 'Alergias',
  conditions: 'Condición médica',
  physician: 'Doctor del Jugador',
  officePhone: 'Teléfono',
  insuranceInfo: 'INFORMACIÓN DE SEGURO MÉDICO',
  insuranceCo: 'Compañía de Seguro Médico',
  phone: 'Teléfono',
  policyHolder: 'Titular de la Póliza',
  policyNum: 'Póliza #',
  groupNum: 'Grupo #',
  insuranceNote: 'POR FAVOR HACER COPIA DE AMBOS LADOS DE LA TARJETA DE SU SEGURO MÉDICO Y ADJUNTAR A ESTE FORMULARIO',
  consentTitle: 'CONSENTIMIENTO DEL PADRE O TUTOR Y ALTA MÉDICA',
  consentBody:
    'Reconociendo la posibilidad de lesión o enfermedad y en consideración de US Youth Soccer y los miembros de US Youth Soccer aceptando a mi hijo/hija como jugador en los programas de fútbol y actividades de US Youth Soccer y sus miembros (los "Programas"), autorizo a mi hijo/hija a participar en los Programas. Además, liberar por este medio, la descarga y de lo contrario indemnizar a US Youth Soccer, sus organizaciones miembros y patrocinadores, sus empleados, personal asociado y voluntarios, incluyendo el propietario de campos e instalaciones utilizadas para los Programas, contra cualquier reclamo por o en nombre de mi hijo/hija jugador como resultado de mi hijo/hija de participación en los Programas o transportados hacia o desde los Programas. Por la presente autorizo el transporte de mi hijo/hija o de los Programas.\n\nMi hijo/hija jugador ha recibido un examen físico por un médico con licencia y se ha encontrado físicamente capaz de participar en el deporte del fútbol. Tengo siempre aviso escrito, el cual es presentado en conjunción con este comunicado y adjunta a la presente, establece cualquier tema específico, afección o dolencia, además de lo que se especifica arriba, que mi hijo/hija tiene o pueda afectar mi participación en los programas. Doy mi consentimiento para que un entrenador deportivo o médico con licencia o dentista proporcione asistencia médica o tratamiento a mi hijo/hija y acepta ser financieramente responsable por el costo razonable de tal asistencia o tratamiento.',
  signatureLabel: 'Firma del padre o tutor',
  dateLabel: 'Fecha',
};
