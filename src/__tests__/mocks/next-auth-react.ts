// Jest stub for next-auth/react — the real package is ESM-only and jest's
// CJS runtime can't require it. Components under test only need these.
export const useSession = () => ({ data: null, status: 'unauthenticated' as const });
export const signIn = jest.fn();
export const signOut = jest.fn();
export const SessionProvider = ({ children }: any) => children;
