// src/hooks/useCategoryManager.js
// Manages custom transaction categories for a club.
// Merges system defaults with club-specific custom categories.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabaseService } from '../services/supabaseService';
import { DEFAULT_CATEGORIES } from '../components/CategoryManager';

/**
 * useCategoryManager
 *
 * Fetches custom categories for the given clubId, provides CRUD operations,
 * and exposes merged label/color maps that Ledger and TransactionModal can consume.
 *
 * @param {string} clubId - The current club's ID
 * @returns {{
 *   customCategories: Array,
 *   categoryLabels: Object,   // { TMF: 'Team Fees', EQP: 'Equipment', ... }
 *   categoryColors: Object,   // { TMF: 'bg-blue-50 text-blue-700', ... }
 *   categoryOptions: Array,   // [{ code, label, flow, description }, ...]
 *   saveCategory: Function,
 *   deleteCategory: Function,
 *   isSaving: boolean,
 *   loading: boolean,
 * }}
 */
export const useCategoryManager = (clubId) => {
  const [customCategories, setCustomCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Fetch custom categories ──
  const fetchCategories = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    try {
      const cats = await supabaseService.getCustomCategories(clubId);
      setCustomCategories(cats);
    } catch (err) {
      console.error('Failed to fetch custom categories:', err);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // ── Save (create or update) ──
  const saveCategory = useCallback(
    async (catData) => {
      if (!clubId) return;
      setIsSaving(true);
      try {
        if (catData.id) {
          await supabaseService.updateCustomCategory(catData.id, catData);
        } else {
          await supabaseService.addCustomCategory({ ...catData, clubId });
        }
        await fetchCategories();
      } catch (err) {
        console.error('Failed to save category:', err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [clubId, fetchCategories],
  );

  // ── Delete ──
  const deleteCategory = useCallback(
    async (catId) => {
      setIsSaving(true);
      try {
        await supabaseService.deleteCustomCategory(catId);
        await fetchCategories();
      } catch (err) {
        console.error('Failed to delete category:', err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategories],
  );

  // ── Merged maps (system + custom) ──
  const categoryLabels = useMemo(() => {
    const labels = {};
    // System defaults first
    Object.entries(DEFAULT_CATEGORIES).forEach(([code, cat]) => {
      labels[code] = cat.label;
    });
    // Custom categories override/extend
    customCategories.forEach((cat) => {
      labels[cat.code] = cat.label;
    });
    return labels;
  }, [customCategories]);

  const categoryColors = useMemo(() => {
    const colors = {};
    Object.entries(DEFAULT_CATEGORIES).forEach(([code, cat]) => {
      colors[code] = cat.color;
    });
    customCategories.forEach((cat) => {
      colors[cat.code] = cat.color;
    });
    return colors;
  }, [customCategories]);

  // Flat options array for select dropdowns (used by TransactionModal)
  const categoryOptions = useMemo(() => {
    const options = [];
    // System categories in a logical order
    const systemOrder = [
      { code: 'TMF', flow: 'income' },
      { code: 'FUN', flow: 'income' },
      { code: 'SPO', flow: 'income' },
      { code: 'OPE', flow: 'expense' },
      { code: 'TOU', flow: 'expense' },
      { code: 'LEA', flow: 'expense' },
      { code: 'FRI', flow: 'expense' },
      { code: 'CRE', flow: 'special' },
      { code: 'TRF', flow: 'special' },
    ];
    systemOrder.forEach(({ code, flow }) => {
      const def = DEFAULT_CATEGORIES[code];
      if (def) {
        options.push({ code, label: def.label, flow, description: def.description, isSystem: true });
      }
    });
    // Custom categories appended
    customCategories.forEach((cat) => {
      options.push({
        code: cat.code,
        label: cat.label,
        flow: cat.flow || 'expense',
        description: cat.description || '',
        isSystem: false,
      });
    });
    return options;
  }, [customCategories]);

  return {
    customCategories,
    categoryLabels,
    categoryColors,
    categoryOptions,
    saveCategory,
    deleteCategory,
    isSaving,
    loading,
  };
};
