#!/usr/bin/env node
/**
 * Post-commit changelog generator.
 * Runs after git commit (via Husky hook), before push.
 * Reads recent commits, sends to Gemini for summarization,
 * and writes the result to Supabase changelogs table.
 *
 * Required env vars: GEMINI_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Supabase table DDL:
 *   CREATE TABLE changelogs (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     build_number integer NOT NULL,
 *     commit_hash text NOT NULL UNIQUE,
 *     commit_short text NOT NULL,
 *     commit_message text NOT NULL,
 *     commit_date timestamptz NOT NULL,
 *     ai_summary jsonb,
 *     created_at timestamptz DEFAULT now()
 *   );
 */

import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('⏭ Changelog: Missing Supabase credentials, skipping.');
  process.exit(0);
}

async function getExistingHashes() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/changelogs?select=commit_hash&order=created_at.desc&limit=100`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return new Set(data.map((r) => r.commit_hash));
}

async function summarizeWithGemini(commits) {
  if (!GEMINI_KEY || commits.length === 0) return null;

  const prompt = `You are a changelog writer for a youth soccer team management web app called "NOLA DFC Manager".
The app manages team rosters, budgets, schedules, payments, medical forms, and documents.

Given these git commits, create a concise, user-friendly changelog.
Focus on what changed from the USER's perspective, not code details.
Skip commits about CI, formatting, linting, or internal refactoring unless they affect the user.

Rules:
- Each entry should be a JSON object with "category" and "description"
- Categories: "feature", "improvement", "bugfix", "ui"
- Each description should be 1 short sentence (max 15 words)
- Combine related commits into single entries
- Return ONLY a valid JSON array: [{"category": "...", "description": "..."}]
- If nothing user-facing changed, return []

Commits:
${commits.map((c) => `- ${c.message}`).join('\n')}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      },
    );

    if (!response.ok) {
      console.warn(`⚠ Gemini API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('⚠ Gemini summarization failed:', err.message);
  }
  return null;
}

async function main() {
  // Get recent commits
  const log = execSync('git log --pretty=format:"%H||%h||%s||%aI" -20', { encoding: 'utf-8' });
  const commits = log
    .trim()
    .split('\n')
    .map((line) => {
      const [hash, short, message, date] = line.split('||');
      return { hash, short, message, date };
    });

  if (commits.length === 0) {
    console.log('⏭ Changelog: No commits found.');
    return;
  }

  // Check which commits are already in DB
  const existing = await getExistingHashes();
  const newCommits = commits.filter((c) => !existing.has(c.hash));

  if (newCommits.length === 0) {
    console.log('✓ Changelog: All commits already recorded.');
    return;
  }

  console.log(`📝 Changelog: Processing ${newCommits.length} new commit(s)...`);

  // Get AI summary for the batch of new commits
  const aiSummary = await summarizeWithGemini(newCommits);

  // Get build number
  const buildNumber = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim(), 10);

  // Insert new commits into Supabase
  const rows = newCommits.map((c, i) => ({
    build_number: buildNumber - i,
    commit_hash: c.hash,
    commit_short: c.short,
    commit_message: c.message,
    commit_date: c.date,
    ai_summary: i === 0 && aiSummary ? aiSummary : null, // attach summary to latest commit only
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/changelogs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`⚠ Changelog insert failed: ${err}`);
  } else {
    console.log(`✓ Changelog: ${newCommits.length} commit(s) recorded${aiSummary ? ' with AI summary' : ''}.`);
  }
}

main().catch((err) => {
  console.warn('⚠ Changelog generation error:', err.message);
  process.exit(0); // Don't block the commit
});
