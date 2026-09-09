
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/db/prisma"

// Validate Google OAuth credentials
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const authSecret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();

// Validate required environment variables
const isConfigValid = googleClientId && 
                     googleClientSecret && 
                     authSecret && 
                     nextAuthUrl;

if (!isConfigValid) {
    console.error('⚠️ NextAuth configuration is incomplete!');
    console.error('GOOGLE_CLIENT_ID:', googleClientId ? '✅ Set' : '❌ Missing');
    console.error('GOOGLE_CLIENT_SECRET:', googleClientSecret ? '✅ Set' : '❌ Missing');
    console.error('AUTH_SECRET:', authSecret ? '✅ Set' : '❌ Missing');
    console.error('NEXTAUTH_URL:', nextAuthUrl ? `✅ Set (${nextAuthUrl})` : '❌ Missing');
    console.error('Please set all required environment variables.');
}

// Only initialize Google provider if credentials are valid
const providers = [];
if (googleClientId && googleClientSecret) {
    providers.push(
        Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
        })
    );
}

// Resolve auth secret:
// - explicit AUTH_SECRET/NEXTAUTH_SECRET (preferred)
// - dev: fixed insecure fallback (never use in production)
// - production without secret: ephemeral random secret — secure, but sessions
//   reset on every restart. Loud warning so the operator sets AUTH_SECRET.
const resolvedAuthSecret = authSecret
    ?? (process.env.NODE_ENV !== 'production'
        ? 'dev-only-insecure-secret-do-not-use-in-production'
        : randomBytes(32).toString('base64'));

if (!authSecret && process.env.NODE_ENV === 'production') {
    console.error('⚠️ AUTH_SECRET/NEXTAUTH_SECRET is not set in production — using an ephemeral random secret (sessions will reset on restart). Set AUTH_SECRET!');
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: providers.length > 0 ? providers : [],
    secret: resolvedAuthSecret,
    basePath: "/api/auth",
    trustHost: true, // Required for Vercel/production - uses NEXTAUTH_URL from env
    pages: {
        signIn: '/',
        error: '/',
    },
    callbacks: {
        async session({ session, user }) {
            if (session.user) {
                session.user.id = user.id;
            }
            return session;
        },
        async signIn({ user, account, profile }) {
            // Allow sign in if Google OAuth is configured
            if (account?.provider === 'google') {
                return true;
            }
            return false;
        },
    },
    debug: process.env.NODE_ENV === 'development',
})
