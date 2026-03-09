// src/hooks/useTeamContext.js
// Central team context hook. Manages:
//   - Current user's roles (from user_roles table)
//   - Club info
//   - Teams the user can access
//   - Selected team + team-season
//   - Role-based permissions

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabaseService } from '../services/supabaseService';
import { hasPermission, getAccessibleTeamIds, getHighestTeamRole, getNavItemsForRole, PERMISSIONS, CLUB_ROLES } from '../utils/roles';

export const useTeamContext = (user) => {
  const [userRoles, setUserRoles] = useState([]);
  const [club, setClub] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Fetch roles and teams on login ──
  const fetchContext = useCallback(async () => {
    if (!user) {
      setUserRoles([]); setClub(null); setTeams([]); setSelectedTeamId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Get user's roles
      const roles = await supabaseService.getUserRoles();
      setUserRoles(roles);

      if (roles.length === 0) {
        // User has no roles — might be a parent (handled by guardian email match)
        setLoading(false);
        return;
      }

      // 2. Determine club
      const clubId = roles.find(r => r.clubId)?.clubId 
        || roles.find(r => r.teamId)?.teamId; // fallback: derive from team
      
      let clubData = null;
      if (roles.find(r => r.clubId)) {
        clubData = await supabaseService.getClub(roles.find(r => r.clubId).clubId);
      } else {
        clubData = await supabaseService.getClubForUser();
      }
      setClub(clubData);

      // 3. Fetch teams the user can access
      if (clubData) {
        const allTeams = await supabaseService.getTeams(clubData.id);
        const accessibleIds = getAccessibleTeamIds(roles, allTeams.map(t => t.id));
        const visibleTeams = allTeams.filter(t => accessibleIds.includes(t.id));
        setTeams(visibleTeams);

        // Auto-select first team, or restore from localStorage
        const stored = localStorage.getItem('nola_selected_team');
        const validStored = stored && visibleTeams.find(t => t.id === stored);
        setSelectedTeamId(validStored ? stored : visibleTeams[0]?.id || null);
      }
    } catch (e) {
      console.error('Team context fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  // Persist team selection
  useEffect(() => {
    if (selectedTeamId) localStorage.setItem('nola_selected_team', selectedTeamId);
  }, [selectedTeamId]);

  // ── Derived state ──
  const selectedTeam = useMemo(() => teams.find(t => t.id === selectedTeamId) || null, [teams, selectedTeamId]);

  // Determine the user's effective role level
  const effectiveRole = useMemo(() => {
    if (!user || userRoles.length === 0) return 'parent'; // default fallback
    if (userRoles.some(r => r.role === 'club_admin')) return 'club_admin';
    if (userRoles.some(r => r.role === 'club_manager')) return 'club_manager';
    if (selectedTeamId) return getHighestTeamRole(userRoles, selectedTeamId) || 'parent';
    return 'parent';
  }, [user, userRoles, selectedTeamId]);

  // Is this user a staff member (any role) vs a parent?
  const isStaff = useMemo(() => userRoles.length > 0, [userRoles]);

  // Permission check helper for the selected team
  const can = useCallback((permission) => {
    return hasPermission(userRoles, permission, selectedTeamId);
  }, [userRoles, selectedTeamId]);

  // Nav items for the selected team
  const navItems = useMemo(() => {
    if (!selectedTeamId) return ['dashboard', 'schedule'];
    return getNavItemsForRole(userRoles, selectedTeamId);
  }, [userRoles, selectedTeamId]);

  // Is club admin?
  const isClubAdmin = useMemo(() => userRoles.some(r => CLUB_ROLES[r.role]), [userRoles]);

  return {
    // Data
    userRoles,
    club,
    teams,
    selectedTeam,
    selectedTeamId,
    setSelectedTeamId,
    effectiveRole,
    isStaff,
    isClubAdmin,
    navItems,
    loading,
    
    // Helpers
    can,            // can('team:edit_budget') → boolean
    PERMISSIONS,    // re-export for convenience

    // Refresh
    refreshContext: fetchContext,
  };
};