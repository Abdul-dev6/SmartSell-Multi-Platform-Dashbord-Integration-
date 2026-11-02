import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

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
