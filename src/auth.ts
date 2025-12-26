
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
    ],
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-key-change-in-production",
    trustHost: true, // Required for Vercel/production
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
