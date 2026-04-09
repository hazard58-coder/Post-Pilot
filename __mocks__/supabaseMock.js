// Mock Supabase client for Jest tests
const supabase = {
  configured: false,
  signIn: jest.fn().mockResolvedValue({ user: null }),
  signUp: jest.fn().mockResolvedValue({ user: null }),
  signOut: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(() => () => {}),
  subscribeToTable: jest.fn(() => () => {}),
  restoreSession: jest.fn().mockResolvedValue(null),
  resetPassword: jest.fn().mockResolvedValue(undefined),
};

module.exports = { supabase, default: supabase };
