import '@testing-library/jest-dom';

// ── Global Supabase mock ─────────────────────────────────────────────────────
// Prevents any real DB call from firing during tests. Individual test files can
// override this with their own vi.mock('../../supabase', ...), which takes
// precedence over this global one.
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file' } }),
        remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' } }),
      })),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

// ── matchMedia ───────────────────────────────────────────────────────────────
// jsdom ships no implementation, so anything reading a breakpoint (the shell
// chrome, ResponsiveModal) throws on mount. Width queries report true and
// everything else false, which puts tests on the desktop layout by default —
// suites that care about the narrow path install their own stub in beforeEach,
// and assigning over this one is enough to win.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
