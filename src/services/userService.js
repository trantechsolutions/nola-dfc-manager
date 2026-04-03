import { supabase } from '../supabase';

export const userService = {
  getUserRoles: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('user_roles')
      .select('*, clubs(name, slug), teams(name, age_group, gender)')
      .eq('user_id', user.id);
    if (error) throw error;
    return data.map((r) => ({
      id: r.id,
      userId: r.user_id,
      clubId: r.club_id,
      teamId: r.team_id,
      role: r.role,
      clubName: r.clubs?.name || null,
      teamName: r.teams?.name || null,
    }));
  },

  getTeamRoles: async (teamId) => {
    const { data: team, error: tErr } = await supabase.from('teams').select('club_id').eq('id', teamId).single();
    if (tErr) throw tErr;

    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .or(`team_id.eq.${teamId},club_id.eq.${team.club_id}`);
    if (error) throw error;

    const userIds = [...new Set(data.map((r) => r.user_id))];
    let profileMap = {};
    if (userIds.length > 0) {
      try {
        const profiles = await userService.getUserProfiles(userIds);
        profiles.forEach((p) => {
          profileMap[p.userId] = p;
        });
      } catch (e) {
        console.warn('Could not fetch user profiles:', e.message);
      }
    }

    return data.map((r) => {
      const profile = profileMap[r.user_id] || {};
      return {
        id: r.id,
        userId: r.user_id,
        teamId: r.team_id,
        clubId: r.club_id,
        role: r.role,
        displayName: profile.displayName || null,
        email: profile.email || null,
        isClubLevel: !r.team_id && !!r.club_id,
      };
    });
  },

  assignRole: async (userId, role, { clubId, teamId } = {}) => {
    const row = { user_id: userId, role };
    if (clubId) row.club_id = clubId;
    if (teamId) row.team_id = teamId;
    const { data, error } = await supabase.from('user_roles').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  revokeRole: async (roleId) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
    if (error) throw error;
  },

  getUserIdByEmail: async (email) => {
    const { data, error } = await supabase.rpc('get_user_id_by_email', { p_email: email.toLowerCase().trim() });
    if (error) throw error;
    return data;
  },

  assignRoleByEmail: async (email, role, { clubId, teamId } = {}) => {
    const userId = await userService.getUserIdByEmail(email);
    if (!userId) throw new Error(`No account found for "${email}". Send them an invitation instead.`);
    return await userService.assignRole(userId, role, { clubId, teamId });
  },

  ensureUserProfile: async (authUser) => {
    if (!authUser?.id || !authUser?.email) return;
    const { error } = await supabase.from('user_profiles').upsert(
      {
        user_id: authUser.id,
        email: authUser.email,
        display_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email.split('@')[0],
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    if (error) {
      // Non-fatal — log but don't block the app
      console.warn('ensureUserProfile failed:', error.message);
    }
  },

  getTeamGuardiansWithStatus: async (teamId) => {
    const { data: players, error } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, guardians(*)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('last_name');
    if (error) throw error;

    const guardianMap = {};
    players.forEach((p) => {
      (p.guardians || []).forEach((g) => {
        const email = (g.email || '').toLowerCase().trim();
        if (!email) return;
        if (!guardianMap[email]) {
          guardianMap[email] = {
            guardianId: g.id,
            name: g.name,
            email,
            phone: g.phone,
            players: [],
            userId: null,
            hasAccount: false,
            roles: [],
          };
        }
        guardianMap[email].players.push({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          jersey: p.jersey_number,
        });
      });
    });

    const emails = Object.keys(guardianMap);
    if (emails.length > 0) {
      const { data: teamRoles } = await supabase.from('user_roles').select('*').eq('team_id', teamId);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, display_name')
        .in('email', emails);
      const emailToProfile = {};
      (profiles || []).forEach((p) => {
        if (p.email) emailToProfile[p.email.toLowerCase()] = p;
      });

      emails.forEach((email) => {
        const profile = emailToProfile[email];
        if (profile) {
          guardianMap[email].userId = profile.user_id;
          guardianMap[email].hasAccount = true;
          guardianMap[email].displayName = profile.display_name;
          guardianMap[email].roles = (teamRoles || [])
            .filter((r) => r.user_id === profile.user_id)
            .map((r) => ({ id: r.id, role: r.role }));
        }
      });
    }

    return Object.values(guardianMap).sort((a, b) => a.name.localeCompare(b.name));
  },

  getUserProfiles: async (userIds) => {
    if (!userIds || userIds.length === 0) return [];
    const { data, error } = await supabase.from('user_profiles').select('*').in('user_id', userIds);
    if (error) throw error;
    return data.map((p) => ({
      id: p.id,
      userId: p.user_id,
      displayName: p.display_name,
      email: p.email,
      phone: p.phone,
      avatarUrl: p.avatar_url,
      isActive: p.is_active,
      lastLogin: p.last_login,
    }));
  },

  getClubUsers: async (clubId) => {
    const { data: roles, error: rErr } = await supabase
      .from('user_roles')
      .select('user_id, role, club_id, team_id, teams(name)')
      .or(
        `club_id.eq.${clubId},team_id.in.(${
          (await supabase.from('teams').select('id').eq('club_id', clubId)).data?.map((t) => t.id).join(',') || ''
        })`,
      );
    if (rErr) throw rErr;

    const userIds = [...new Set(roles.map((r) => r.user_id))];
    const profiles = await userService.getUserProfiles(userIds);
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId] = p;
    });

    const users = {};
    roles.forEach((r) => {
      if (!users[r.user_id]) {
        const profile = profileMap[r.user_id] || {};
        users[r.user_id] = {
          userId: r.user_id,
          displayName: profile.displayName || r.user_id.slice(0, 8),
          email: profile.email || '',
          phone: profile.phone || '',
          isActive: profile.isActive ?? true,
          roles: [],
        };
      }
      users[r.user_id].roles.push({
        role: r.role,
        clubId: r.club_id,
        teamId: r.team_id,
        teamName: r.teams?.name || null,
      });
    });
    return Object.values(users);
  },

  updateUserProfile: async (userId, updates) => {
    const row = {};
    if ('displayName' in updates) row.display_name = updates.displayName;
    if ('phone' in updates) row.phone = updates.phone;
    if ('isActive' in updates) row.is_active = updates.isActive;
    const { error } = await supabase.from('user_profiles').update(row).eq('user_id', userId);
    if (error) throw error;
  },

  getInvitations: async (clubId) => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*, teams(name)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      invitedName: inv.invited_name,
      teamId: inv.team_id,
      teamName: inv.teams?.name || null,
      token: inv.token,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at,
    }));
  },

  createInvitation: async (invData) => {
    const { data, error } = await supabase
      .from('invitations')
      .insert({
        club_id: invData.clubId,
        team_id: invData.teamId || null,
        email: invData.email.toLowerCase().trim(),
        role: invData.role,
        invited_name: invData.name || null,
        invited_by: invData.invitedBy,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteInvitation: async (invId) => {
    const { error } = await supabase.from('invitations').delete().eq('id', invId);
    if (error) throw error;
  },

  acceptInvitation: async (token) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();
    if (invErr || !inv) throw new Error('Invalid or expired invitation');

    const roleData = { user_id: user.id, role: inv.role };
    if (inv.role.startsWith('club_')) roleData.club_id = inv.club_id;
    else roleData.team_id = inv.team_id;

    const { error: roleErr } = await supabase.from('user_roles').insert(roleData);
    if (roleErr && !roleErr.message.includes('duplicate')) throw roleErr;

    await supabase.from('user_profiles').upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: inv.invited_name || user.email.split('@')[0],
      },
      { onConflict: 'user_id' },
    );

    await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', inv.id);

    return { role: inv.role, teamId: inv.team_id, clubId: inv.club_id };
  },
};
