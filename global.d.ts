// 例: /global.d.ts

import { DefaultSession } from "next-auth";

// next-auth に含まれる型を拡張する
declare module "next-auth" {
  // **ユーザーがログイン時に返ってくるUserの型**を拡張
  interface User {
    id: string;
    username: string;
    isAdmin: boolean;
  }

  // **セッションに含めるuserの型**を拡張
  interface Session {
    user: {
      id: string;
      username: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

// このファイル自体がモジュールとして解決されるように
export {};
