import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { encrypt } from "./crypto";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { scope: "openid profile email https://www.googleapis.com/auth/drive.readonly" } }
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: { params: { scope: "email,public_profile,instagram_basic,instagram_content_publish,pages_show_list,instagram_manage_insights" } }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        // update Account record with encrypted tokens
        try {
          const a = await prisma.account.findFirst({
            where: { provider: account.provider, userId: user.id },
            orderBy: { createdAt: "desc" }
          });
          if (a) {
            await prisma.account.update({
              where: { id: a.id },
              data: {
                access_token_enc: account.access_token ? encrypt(account.access_token) : undefined,
                refresh_token_enc: account.refresh_token ? encrypt(account.refresh_token) : undefined,
                token_expires_at: account.expires_at ? Math.floor(account.expires_at) : undefined,
                scope: account.scope
              }
            });
          }
        } catch (err) {
          console.error("save tokens error", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) session.user.id = token.sub;
      return session;
    }
  }
} as const;
