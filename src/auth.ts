
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
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

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: providers.length > 0 ? providers : [],
    secret: authSecret || "fallback-secret-key-change-in-production",
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
