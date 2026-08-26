-- Distribution state inspection (READ ONLY — nothing here modifies data)
-- =========================================================================
-- Run after cleanup_ghost_distribution_credits.sql comes back empty. Those
-- queries all key off original_tx_id — the link from a credit row back to the
-- deposit it came from. Anything written without that link is invisible to
-- them. These queries look at the distribution data from the other side.

-- =========================================================================
-- A. Every batch on the books: what the sponsors History tab is grouping.
--    A batch with no deposit link (deposit_id null) still has an undo button,
--    but nothing to reopen — and it never showed up in the earlier checks.
-- =========================================================================
select c.waterfall_batch_id,
       min(c.date)                      as batch_date,
       count(*)                         as credit_rows,
       sum(c.amount)                    as credited_total,
       count(*) filter (where c.player_id is null) as team_pool_rows,
       max(c.original_tx_id::text)      as deposit_id,
       max(src.title)                   as deposit_title,
       max(src.amount)                  as deposit_amount,
       bool_or(src.distributed)         as deposit_distributed,
       count(distinct c.team_season_id) as distinct_team_seasons,
       count(*) filter (where c.team_season_id is null) as unscoped_rows
from transactions c
left join transactions src on src.id = c.original_tx_id
where c.waterfall_batch_id is not null
group by c.waterfall_batch_id
order by batch_date desc;

-- =========================================================================
-- B. Credits with a batch id but NO deposit link. Undo still deletes these by
--    batch id, so they are only a problem if the batch id itself is wrong.
-- =========================================================================
select id, season_id, team_season_id, date, title, amount, player_id, category, waterfall_batch_id
from transactions
where waterfall_batch_id is not null
  and original_tx_id is null
order by date desc;

-- =========================================================================
-- C. UNSCOPED ROWS — the ghost shape that hits parents specifically.
--    transactions_select lets staff see a row only through
--    team_season_id -> team_seasons -> user_team_ids(), but guardians also see
--    it through player_id. A row with team_season_id = NULL is therefore
--    INVISIBLE to the treasurer and VISIBLE to the parent, and every delete
--    the treasurer issues against it silently matches nothing.
--    (sql/fix_unscoped_transactions.sql backfills these.)
-- =========================================================================
select id, season_id, date, title, amount, player_id, category,
       waterfall_batch_id, original_tx_id, distributed, cleared
from transactions
where team_season_id is null
order by date desc;

-- =========================================================================
-- D. Same deposit distributed more than once — a double click on Apply, or a
--    redistribute after a half-finished undo. Each batch is independently
--    undoable, so undoing one leaves the other's credits behind.
-- =========================================================================
select c.original_tx_id,
       max(src.title)                       as deposit_title,
       max(src.amount)                      as deposit_amount,
       count(distinct c.waterfall_batch_id) as batches,
       sum(c.amount)                        as credited_total,
       array_agg(distinct c.waterfall_batch_id) as batch_ids
from transactions c
join transactions src on src.id = c.original_tx_id
where c.waterfall_batch_id is not null
group by c.original_tx_id
having count(distinct c.waterfall_batch_id) > 1
order by max(src.date) desc;

-- =========================================================================
-- E. Credits that landed in a different season than their deposit. The
--    sponsors page only ever lists the selected season, so these are undoable
--    from one season and visible to the parent under another.
-- =========================================================================
select c.id, c.date, c.title, c.amount, c.player_id,
       c.season_id as credit_season, src.season_id as deposit_season,
       c.waterfall_batch_id
from transactions c
join transactions src on src.id = c.original_tx_id
where c.waterfall_batch_id is not null
  and c.season_id is distinct from src.season_id
order by c.date desc;

-- =========================================================================
-- F. Credits sitting on a player who is not enrolled in that season. They
--    show on the guardian's statement with nothing on the roster to explain
--    them.
-- =========================================================================
select c.id, c.date, c.title, c.amount, c.player_id, c.season_id, c.waterfall_batch_id,
       p.first_name, p.last_name
from transactions c
left join players p on p.id = c.player_id
where c.waterfall_batch_id is not null
  and c.player_id is not null
  and not exists (
    select 1 from player_seasons ps
    where ps.player_id = c.player_id and ps.season_id = c.season_id
  )
order by c.date desc;

-- =========================================================================
-- G. Credits categorised outside SPO/FUN. The History tab filters on those
--    two codes, so a category edit in the ledger hides a batch from undo
--    while leaving the rows on every statement.
-- =========================================================================
select id, season_id, date, title, amount, player_id, category, waterfall_batch_id
from transactions
where waterfall_batch_id is not null
  and category not in ('SPO', 'FUN')
order by date desc;

-- =========================================================================
-- H. What the ledger actually holds for sponsorship and fundraising money,
--    deposits and credits side by side. Read this one against what you see on
--    screen — the ghost row is in here somewhere.
-- =========================================================================
select t.id, t.date, t.title, t.amount, t.category,
       t.player_id, t.team_season_id, t.season_id,
       t.cleared, t.distributed, t.waterfall_batch_id, t.original_tx_id,
       case
         when t.waterfall_batch_id is not null then 'credit (from a distribution)'
         when t.distributed then 'deposit (distributed)'
         else 'deposit (undistributed)'
       end as row_kind
from transactions t
where t.category in ('SPO', 'FUN')
order by t.date desc, t.waterfall_batch_id nulls first;
