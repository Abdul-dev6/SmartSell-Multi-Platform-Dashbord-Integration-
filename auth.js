import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { isSocialEmailVerified, unverifiedEmailRedirect } from "@/lib/auth/verifiedEmail";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
  ],

  pages: {
    signIn: "/Login",
  },

  callbacks: {
    // Refuse sign-in unless the provider has verified the email address;
    // SmartSell links accounts by email (see lib/auth/verifiedEmail.js).
    async signIn({ account, profile, user }) {
      const provider = account?.provider;
      const verified = await isSocialEmailVerified({
        provider,
        email: user?.email,
        profile,
        accessToken: account?.access_token,
      });
      return verified || unverifiedEmailRedirect(provider === "github" ? "github" : "google");
    },

    // Record the verification in the NextAuth session token. Only tokens
    // issued after signIn passed carry it, so sessions created before this
    // check existed are not accepted by the SmartSell login step.
    jwt({ token, account }) {
      if (account) {
        token.emailVerified = true;
        token.provider = account.provider;
      }
      return token;
    },

    session({ session, token }) {
      session.emailVerified = token?.emailVerified === true;
      session.provider = token?.provider || null;
      return session;
    },

    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;

      const Panel = request.nextUrl.pathname.startsWith("/Panel");

      if (Panel) {
        return isLoggedIn;
      }

      return true;
    },
  },
});
