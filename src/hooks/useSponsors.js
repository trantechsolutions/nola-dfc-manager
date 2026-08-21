// src/hooks/useSponsors.js
// The team's sponsor directory — contact details, pledges, and logos.
// Team-scoped and season-independent: a sponsor carries across years, with
// renewalDate marking when to go back and ask.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { sponsorService } from '../services/sponsorService';

const sortByName = (list) => [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

export const useSponsors = (teamId) => {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const refreshSponsors = useCallback(async () => {
    if (!teamId) {
      setSponsors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSponsors(await sponsorService.getSponsors(teamId));
    } catch (err) {
      console.error('Failed to load sponsors:', err.message);
      setSponsors([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    refreshSponsors();
  }, [refreshSponsors]);

  const upsert = useCallback((row) => {
    setSponsors((prev) =>
      sortByName(prev.some((s) => s.id === row.id) ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row]),
    );
    return row;
  }, []);

  /**
   * Saves the sponsor, then the logo if one was picked. The logo needs a row id
   * to name its object, so a brand-new sponsor is written first and the upload
   * follows — a failed upload therefore leaves a saved sponsor without a logo,
   * which is the recoverable half of the failure.
   */
  const saveSponsor = useCallback(
    async ({ logoFile, removeLogo, ...sponsorData }) => {
      if (!teamId) return null;
      setIsSaving(true);
      try {
        let saved = sponsorData.id
          ? await sponsorService.updateSponsor(sponsorData.id, sponsorData)
          : await sponsorService.createSponsor({ ...sponsorData, teamId });

        if (removeLogo && saved.logoPath) {
          saved = await sponsorService.removeSponsorLogo(saved.id, saved.logoPath);
        }
        if (logoFile) {
          saved = await sponsorService.uploadSponsorLogo(logoFile, {
            sponsorId: saved.id,
            teamId,
            previousPath: saved.logoPath,
          });
        }
        return upsert(saved);
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, upsert],
  );

  const deleteSponsor = useCallback(async (id, logoPath = null) => {
    setIsSaving(true);
    try {
      await sponsorService.deleteSponsor(id, logoPath);
      setSponsors((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setIsSaving(false);
    }
  }, []);

  /**
   * Attaches ledger entries to a sponsor. The rows themselves are untouched
   * beyond the link, so the ledger keeps whatever title the money was booked
   * under even after the sponsor is renamed here.
   */
  const linkTransactions = useCallback(async (sponsorId, txIds) => {
    setIsSaving(true);
    try {
      await sponsorService.linkTransactionsToSponsor(sponsorId, txIds);
    } finally {
      setIsSaving(false);
    }
  }, []);

  /**
   * Seeds a directory card straight from a group of sponsorship deposits: the
   * booked title becomes the starting name and what came in becomes the opening
   * pledge, both editable afterwards.
   */
  const importFromLedger = useCallback(
    async ({ title, txIds, total }) => {
      if (!teamId) return null;
      setIsSaving(true);
      try {
        const created = await sponsorService.createSponsor({
          teamId,
          name: title,
          status: 'paid',
          committedAmount: total,
        });
        await sponsorService.linkTransactionsToSponsor(created.id, txIds);
        return upsert(created);
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, upsert],
  );

  // Pledged money, not banked money — what actually arrived is in the ledger.
  const committedTotal = useMemo(
    () => sponsors.reduce((sum, s) => (s.status === 'declined' ? sum : sum + Number(s.committedAmount || 0)), 0),
    [sponsors],
  );

  return {
    sponsors,
    loading,
    isSaving,
    refreshSponsors,
    saveSponsor,
    deleteSponsor,
    linkTransactions,
    importFromLedger,
    committedTotal,
  };
};
