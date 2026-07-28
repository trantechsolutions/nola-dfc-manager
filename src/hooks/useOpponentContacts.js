// src/hooks/useOpponentContacts.js
// Fetches and manages the opponent-club contact directory for a team. Not
// tied to a season or a specific matchup — the same club contact gets
// reused across every week's negotiation.

import { useState, useEffect, useCallback } from 'react';
import { supabaseService } from '../services/supabaseService';

const sortByClubName = (list) => [...list].sort((a, b) => (a.clubName || '').localeCompare(b.clubName || ''));

export const useOpponentContacts = (team = null) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshContacts = useCallback(async () => {
    if (!team?.id) {
      setContacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await supabaseService.getOpponentContacts(team.id);
      setContacts(rows);
    } catch (err) {
      console.error('Failed to load opponent contacts:', err.message);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [team?.id]);

  useEffect(() => {
    refreshContacts();
  }, [refreshContacts]);

  const createContact = useCallback(
    async (contactData) => {
      const created = await supabaseService.createOpponentContact({ teamId: team.id, ...contactData });
      setContacts((prev) => sortByClubName([...prev, created]));
      return created;
    },
    [team?.id],
  );

  const updateContact = useCallback(async (id, updates) => {
    const updated = await supabaseService.updateOpponentContact(id, updates);
    setContacts((prev) => sortByClubName(prev.map((c) => (c.id === id ? updated : c))));
    return updated;
  }, []);

  const deleteContact = useCallback(async (id) => {
    await supabaseService.deleteOpponentContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { contacts, loading, refreshContacts, createContact, updateContact, deleteContact };
};
