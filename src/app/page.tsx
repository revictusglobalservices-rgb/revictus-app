// Route racine : redirige vers le bon tableau de bord selon le rôle (CA-01 du cadrage).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profil?.role === "manager" || profil?.role === "admin") {
    redirect("/manager");
  }
  redirect("/dashboard");
}
