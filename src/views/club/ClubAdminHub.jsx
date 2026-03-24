import React, { useState } from 'react';
import { Shield, Users, Tag } from 'lucide-react';
import ClubSettings from './ClubSettings';
import UserManagement from './UserManagement';
import CategoryManagementView from './CategoryManagementView';

const TABS = [
  { id: 'settings', label: 'Club Settings', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'categories', label: 'Categories', icon: Tag },
];

export default function ClubAdminHub({ defaultTab = 'settings', settingsProps, usersProps, categoriesProps }) {
  const [tab, setTab] = useState(defaultTab);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'settings' && <ClubSettings {...settingsProps} />}
      {tab === 'users' && <UserManagement {...usersProps} />}
      {tab === 'categories' && <CategoryManagementView {...categoriesProps} />}
    </div>
  );
}
