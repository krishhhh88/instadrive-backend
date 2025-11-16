import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";

import { PrismaAdapter } from "@auth/prisma-adapter";   // ✅ correct package
import { prisma } from "./prisma";
import { encrypt } from "./crypto";

import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid profile email https://www.googleapis.com/auth/drive.readonly",
        },
      },
    }),

    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "email,public_profile,instagram_basic,instagram_content_publish,pages_show_list,instagram_manage_insights",
        },
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // Save encrypted tokens in Prisma
      if (account && user) {
        try {
          const existing = await prisma.account.findFirst({
            where: { provider: account.provider, userId: user.id },
            orderBy: { createdAt: "desc" },
          });

          if (existing) {
            await prisma.account.update({
              where: { id: existing.id },
              data: {
                access_token_enc: account.access_token
                  ? encrypt(account.access_token)
                  : undefined,

                refresh_token_enc: account.refresh_token
                  ? encrypt(account.refresh_token)
                  : undefined,

                token_expires_at: account.expires_at
                  ? Math.floor(account.expires_at)
                  : undefined,

                scope: account.scope ?? undefined,
              },
            });
          }
        } catch (err) {
          console.error("❌ Token save error:", err);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
