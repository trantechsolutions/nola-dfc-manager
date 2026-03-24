import CategoryManager from '../components/CategoryManager';

const mockCategories = {
  TMF: {
    label: 'Team Fees',
    description: 'Monthly player dues and registration fees',
    color: 'bg-blue-50 text-blue-700',
  },
  SPO: {
    label: 'Sponsorship',
    description: 'Revenue from team and jersey sponsors',
    color: 'bg-violet-50 text-violet-700',
  },
  FUN: {
    label: 'Fundraising',
    description: 'Car washes, bake sales, and other fundraisers',
    color: 'bg-emerald-50 text-emerald-700',
  },
  OPE: { label: 'Operating', description: 'Equipment, uniforms, field rental', color: 'bg-slate-100 text-slate-600' },
  TOU: {
    label: 'Tournament',
    description: 'Tournament entry fees and travel costs',
    color: 'bg-amber-50 text-amber-700',
  },
  LEA: {
    label: 'League & Refs',
    description: 'League registration and referee fees',
    color: 'bg-orange-50 text-orange-700',
  },
};

export default {
  title: 'Components/CategoryManager',
  component: CategoryManager,
  argTypes: {
    onSave: { action: 'saved' },
    onDelete: { action: 'deleted' },
    onAdd: { action: 'added' },
  },
};

export const Default = {
  args: {
    categories: mockCategories,
    onSave: () => {},
    onDelete: () => {},
    onAdd: () => {},
  },
};

export const Empty = {
  args: {
    categories: {},
    onSave: () => {},
    onDelete: () => {},
    onAdd: () => {},
  },
};
