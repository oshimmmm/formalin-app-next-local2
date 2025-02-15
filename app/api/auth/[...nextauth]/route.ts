import NextAuth, { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

/**
 * Prismaクライアント
 */
const prisma = new PrismaClient();

/**
 * NextAuth設定
 */
const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("[authorize] 1: credentials:", credentials);

        if (!credentials?.username || !credentials?.password) {
          throw new Error("Missing username or password");
        }

        console.log("[authorize] 2: before findUnique");
        try {
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        console.log("[authorize] 3: user found:", user);
        
        if (!user) {
          console.log("[authorize] 4: -> User not found");
          throw new Error("User not found");
        }

        // パスワードチェック
        console.log("[authorize] 5: before bcrypt.compare");
        const isValid = await bcrypt.compare(credentials.password, user.password);
        console.log("[authorize] 6: password valid:", isValid);

        if (!isValid) {
          console.log("[authorize] 7: -> Invalid password");
          throw new Error("Invalid password");
        }

        console.log("[authorize] 8: -> success, returning user");
        return {
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
        };

      } catch (err) {
        console.error("[authorize] findUnique error:", err);
    // throw err; // or return null; etc.
    throw new Error("Database error");
      }
      },
    }),
  ],

  session: {
    // "jwt"をリテラル型にする
    strategy: "jwt",
  },

  callbacks: {
    // JWTにカスタム情報を含める
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.isAdmin = user.isAdmin;
      }
      return token;
    },

    // sessionにカスタム情報を含める
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export const GET = handler;
export const POST = handler;
