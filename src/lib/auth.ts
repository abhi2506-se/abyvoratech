import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role, UserStatus } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      status: UserStatus;
      agentId?: string | null;
      clientId?: string | null;
      isEmailVerified?: boolean;
      // Multi-tenant scope, read from the User row server-side on every
      // token refresh — never accept this from client input. Null for
      // PLATFORM_OWNER (cross-tenant) and for legacy/ABYVORA-internal rows
      // pre-dating the multi-tenant layer (see prisma/seed.ts backfill).
      organizationId?: string | null;
      mfaEnabled?: boolean;
      // True only once MFA has been verified *this session* for a user
      // that requires it. See lib/mfa.ts — every Platform Owner route
      // checks this, not just mfaEnabled, so a stolen JWT still can't
      // reach the admin console without the second factor.
      mfaVerified?: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    status: UserStatus;
    agentId?: string | null;
    clientId?: string | null;
    isEmailVerified?: boolean;
    organizationId?: string | null;
    mfaEnabled?: boolean;
    mfaVerified?: boolean;
  }
}

export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Rate limit login attempts per email to slow down credential
        // stuffing/brute force. This is best-effort in-memory (see
        // rate-limit.ts) — swap for a shared store on multi-instance deploys.
        const rl = checkRateLimit(`login:${email}`, 8, 10 * 60 * 1000);
        if (!rl.allowed) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        if (user.status === "DISABLED") {
          throw new Error("ACCOUNT_DISABLED");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        } as any;
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // Google sign-in is only wired for the CLIENT role at signup time.
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: (user as any).id ?? token.sub! },
          include: { agentProfile: true, clientProfile: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.status = dbUser.status;
          token.agentId = dbUser.agentProfile?.id ?? null;
          token.clientId = dbUser.clientProfile?.id ?? null;
          token.isEmailVerified = !!dbUser.emailVerified;
          token.organizationId = dbUser.organizationId ?? null;
          token.mfaEnabled = dbUser.mfaEnabled;
          // A fresh sign-in always starts un-verified for MFA accounts —
          // the credentials/password check is only the first factor. The
          // /api/auth/mfa/verify route below is the only place this flips
          // to true, via the `trigger === "update"` branch.
          token.mfaVerified = !dbUser.mfaEnabled;
        }
      }

      // Server-triggered token patch (called from the MFA verify route via
      // updateSession()). We deliberately only allow flipping mfaVerified —
      // this callback ignores any other field the caller might pass, so a
      // compromised call site can't use `update()` to self-grant a role or
      // organizationId change.
      if (trigger === "update" && session?.user?.mfaVerified === true) {
        token.mfaVerified = true;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.agentId = token.agentId;
        session.user.clientId = token.clientId;
        session.user.isEmailVerified = token.isEmailVerified;
        session.user.organizationId = token.organizationId;
        session.user.mfaEnabled = token.mfaEnabled;
        session.user.mfaVerified = token.mfaVerified;
      }
      return session;
    },
    async signIn({ user }) {
      // Re-check disabled status on every sign-in (covers OAuth path too)
      const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
      if (dbUser && dbUser.status === "DISABLED") return false;
      return true;
    },
  },
});
