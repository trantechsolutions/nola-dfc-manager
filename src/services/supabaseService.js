// src/services/supabaseService.js
// ──────────────────────────────────────────────────────────────────────
// Re-export hub — imports all domain-specific service modules and
// composes them into a single `supabaseService` object for backward
// compatibility. Existing consumers continue to work unchanged:
//
//   import { supabaseService } from '../services/supabaseService';
//
// For new code, prefer importing the domain module directly:
//
//   import { playerService } from '../services/playerService';
// ──────────────────────────────────────────────────────────────────────
import { playerService } from './playerService';
import { financeService } from './financeService';
import { budgetService } from './budgetService';
import { teamService } from './teamService';
import { clubService } from './clubService';
import { scheduleService } from './scheduleService';
import { userService } from './userService';
import { documentService } from './documentService';
import { seasonService } from './seasonService';
import { categoryService } from './categoryService';
import { rubricService } from './rubricService';

export const supabaseService = {
  ...playerService,
  ...financeService,
  ...budgetService,
  ...teamService,
  ...clubService,
  ...scheduleService,
  ...userService,
  ...documentService,
  ...seasonService,
  ...categoryService,
  ...rubricService,
};

export default supabaseService;
