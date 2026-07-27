import { supabaseService } from '../services/supabaseService';

// Bulk-downloads a set of already-uploaded documents (e.g. all medical release
// forms for a team) as a single zip file. Each doc needs { filePath, fileName,
// title, playerName }. Failures on individual files are skipped rather than
// aborting the whole zip, since one corrupt/missing storage object shouldn't
// block a team admin from getting everyone else's forms.
export async function downloadDocumentsAsZip(docs, zipFileName) {
  if (!docs?.length) return { downloaded: 0, failed: 0 };

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedNames = new Set();
  let failed = 0;

  for (const doc of docs) {
    let blob;
    try {
      blob = await supabaseService.downloadDocumentBlob(doc.filePath);
    } catch {
      failed += 1;
      continue;
    }

    const baseName = doc.fileName || `${doc.title || 'document'}.pdf`;
    const playerLabel = doc.playerName ? doc.playerName.replace(/[^\w\- ]/g, '').trim() : null;
    const name = playerLabel ? `${playerLabel} - ${baseName}` : baseName;

    let finalName = name;
    let n = 1;
    while (usedNames.has(finalName)) {
      const dot = name.lastIndexOf('.');
      finalName = dot > -1 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
      n += 1;
    }
    usedNames.add(finalName);
    zip.file(finalName, blob);
  }

  if (usedNames.size === 0) return { downloaded: 0, failed };

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { downloaded: usedNames.size, failed };
}
