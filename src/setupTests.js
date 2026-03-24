import '@testing-library/jest-dom';

// ── Global Supabase mock ─────────────────────────────────────────────────────
// Prevents any real DB calls from firing during tests.
// Individual tests can override specific methods with vi.mocked() or
// vi.spyOn(supabaseService, 'methodName').mockResolvedValue(...)
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
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
      })),
    },
  },
}));
