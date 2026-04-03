import { supabase } from '../supabase';

/**
 * Log an audit event to the audit_log table.
 * This should never throw -- failures are silently logged to console.
 *
 * @param {Object} params
 * @param {string} params.tableName - The table that was modified
 * @param {string} [params.recordId] - The ID of the record that was modified
 * @param {string} params.action - insert, update, or delete
 * @param {string} params.changedBy - The user ID who made the change
 * @param {Object} [params.oldData] - Previous state of the record
 * @param {Object} [params.newData] - New state of the record
 * @param {Object} [params.metadata] - Extra context (season_id, team_id, etc.)
 */
export async function logAuditEvent({ tableName, recordId, action, changedBy, oldData, newData, metadata }) {
  try {
    const { error } = await supabase.from('audit_log').insert({
      table_name: tableName,
      record_id: recordId || null,
      action,
      changed_by: changedBy,
      old_data: oldData || null,
      new_data: newData || null,
      metadata: metadata || null,
    });
    if (error) {
      console.warn('Audit log insert failed:', error.message);
    }
  } catch (err) {
    console.warn('Audit log error:', err.message);
  }
}
