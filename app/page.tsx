// app/page.tsx 
import { redirect } from "next/navigation"; 

export default function MainPage() { 
  // ルートアクセスされたら、強制的にログインページへ 
  redirect("/login"); 
  return null; 
} 