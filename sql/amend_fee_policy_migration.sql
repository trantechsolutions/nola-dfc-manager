-- Migration: let each team choose whether a budget amendment re-derives the fee.
-- Run this in the Supabase SQL editor.
--
-- Pushing an event's expenses into a FINALIZED budget is recorded as an
-- amendment. Whether that amendment also moves base_fee is a real policy split
-- between teams: some treat the finalized fee as a promise to families and
-- absorb overruns from the buffer or carryover, others expect the roster to
-- cover what the season actually costs. Hard-coding either one is wrong for
-- half the teams, so it lives per team-season alongside buffer_percent.
--
-- Defaults to true, which matches what the Amend Budget button on the budget
-- screen has always done.

alter table team_seasons
  add column if not exists amend_recalculates_fee boolean not null default true;

comment on column team_seasons.amend_recalculates_fee is
  'When true, a budget amendment re-derives base_fee from the amended totals, changing what each player owes. When false the amendment records the spend and leaves fees untouched.';
