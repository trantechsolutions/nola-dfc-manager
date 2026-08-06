import { useState } from 'react';
import { Shield, Users, Tag } from 'lucide-react';
import SettingsShell from '../../components/layout/SettingsShell';
import ClubSettings from './ClubSettings';
import UserManagement from './UserManagement';
import CategoryManagementView from './CategoryManagementView';

const SECTIONS = [
  { id: 'settings', label: 'Club Settings', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'categories', label: 'Categories', icon: Tag },
];

export default function ClubAdminHub({ defaultTab = 'settings', settingsProps, usersProps, categoriesProps }) {
  const [tab, setTab] = useState(defaultTab);

  return (
    <SettingsShell sections={SECTIONS} active={tab} onChange={setTab}>
      {tab === 'settings' && <ClubSettings {...settingsProps} />}
      {tab === 'users' && <UserManagement {...usersProps} />}
      {tab === 'categories' && <CategoryManagementView {...categoriesProps} />}
    </SettingsShell>
  );
}
