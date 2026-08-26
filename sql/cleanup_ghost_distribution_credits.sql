-- Ghost distribution credits
-- =========================================================================
-- Companion to the client fix in useFinance.revertWaterfall / financeService.
--
-- Distributing a sponsorship or fundraiser deposit writes one credit row per
-- player (waterfall_batch_id set, original_tx_id = the deposit) and flips the
-- deposit's `distributed` flag. Undo was supposed to delete the batch and clear
-- the flag, but it never checked that the delete matched anything:
--
--   delete from transactions where waterfall_batch_id = $1;   -- 0 rows = success
--
-- PostgREST reports no error for a delete that matches nothing (rows outside the
-- caller's RLS scope, a batch already undone elsewhere), so the flag was cleared
-- while the credits stayed on the books. The sponsors history stopped listing
-- the batch — there was no longer an undo button for it — but every guardian
-- still sees those credits on their player's statement.
--
-- Run the diagnostics first. The deletes are wrapped in a transaction; review
-- the counts before committing.

-- =========================================================================
-- 1. DIAGNOSTIC — credits whose deposit says it was never distributed.
--    This is the reported symptom: undo cleared the flag, the rows survived.
-- =========================================================================
select c.id, c.season_id, c.team_season_id, c.date, c.title, c.amount,
       c.player_id, c.waterfall_batch_id, c.original_tx_id,
       src.title as deposit_title, src.distributed as deposit_distributed
from transactions c
join transactions src on src.id = c.original_tx_id
where c.waterfall_batch_id is not null
  and src.distributed is not true
order by c.date desc, c.waterfall_batch_id;

-- =========================================================================
-- 2. DIAGNOSTIC — credits whose source deposit is gone entirely.
-- =========================================================================
select c.id, c.season_id, c.team_season_id, c.date, c.title, c.amount,
       c.player_id, c.waterfall_batch_id, c.original_tx_id
from transactions c
where c.waterfall_batch_id is not null
  and c.original_tx_id is not null
  and not exists (select 1 from transactions src where src.id = c.original_tx_id)
order by c.date desc;

-- =========================================================================
-- 3. DIAGNOSTIC — half-written batches: credits tied to a deposit but never
--    grouped under a batch id, so the history tab can never undo them.
-- =========================================================================
select c.id, c.season_id, c.date, c.title, c.amount, c.player_id, c.original_tx_id
from transactions c
where c.original_tx_id is not null
  and c.waterfall_batch_id is null
  and c.refund_of_tx_id is null
order by c.date desc;

-- =========================================================================
-- 4. DIAGNOSTIC — the inverse ghost: a deposit flagged distributed whose
--    credits are gone. That money is credited to nobody and the sponsors page
--    will not offer it for distribution again.
-- =========================================================================
select src.id, src.season_id, src.date, src.title, src.amount, src.category
from transactions src
where src.distributed is true
  and not exists (
    select 1 from transactions c
    where c.original_tx_id = src.id and c.waterfall_batch_id is not null
  )
order by src.date desc;

-- =========================================================================
-- 5. CLEANUP — remove the orphaned credits found in 1-3, then reopen the
--    deposits from 4 so they can be distributed again.
--    Review the diagnostics above before committing.
-- =========================================================================
begin;

-- 5a. Credits left behind by an undo that cleared the deposit flag.
delete from transactions c
using transactions src
where src.id = c.original_tx_id
  and c.waterfall_batch_id is not null
  and src.distributed is not true;

-- 5b. Credits whose deposit no longer exists.
delete from transactions c
where c.waterfall_batch_id is not null
  and c.original_tx_id is not null
  and not exists (select 1 from transactions src where src.id = c.original_tx_id);

-- 5c. Half-written batches. Refunds carry refund_of_tx_id and are left alone.
delete from transactions c
where c.original_tx_id is not null
  and c.waterfall_batch_id is null
  and c.refund_of_tx_id is null;

-- 5d. Deposits flagged distributed with nothing to show for it.
update transactions src
set distributed = false
where src.distributed is true
  and not exists (
    select 1 from transactions c
    where c.original_tx_id = src.id and c.waterfall_batch_id is not null
  );

commit;

-- =========================================================================
-- 6. VERIFY — all four diagnostics should return zero rows.
-- =========================================================================
select
  (select count(*) from transactions c join transactions src on src.id = c.original_tx_id
   where c.waterfall_batch_id is not null and src.distributed is not true)      as credits_on_undone_deposits,
  (select count(*) from transactions c
   where c.waterfall_batch_id is not null and c.original_tx_id is not null
     and not exists (select 1 from transactions src where src.id = c.original_tx_id)) as credits_without_deposit,
  (select count(*) from transactions c
   where c.original_tx_id is not null and c.waterfall_batch_id is null
     and c.refund_of_tx_id is null)                                             as half_written_credits,
  (select count(*) from transactions src
   where src.distributed is true
     and not exists (select 1 from transactions c
                     where c.original_tx_id = src.id and c.waterfall_batch_id is not null)) as deposits_with_no_credits;
