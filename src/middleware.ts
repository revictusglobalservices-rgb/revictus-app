// Rafraîchit la session Supabase à chaque requête et protège les pages applicatives.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

// L'appel réseau vers Supabase Auth (edge Vercel -> région Ireland) peut
// occasionnellement traîner. Sans limite, le middleware peut dépasser les 25s
// autorisées par Vercel et renvoyer un 504 (MIDDLEWARE_INVOCATION_TIMEOUT) —
// observé le 28/08/2026 sur /manager et /dashboard/manager. On borne donc
// l'appel et on laisse passer la requête en cas de dépassement/erreur :
// chaque page fait de toute façon son propre contrôle d'authentification
// côté serveur (redirect("/login") si non connecté), donc la sécurité n'est
// pas affectée — seule la redirection immédiate l'est, dans ce cas rare.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }),
      },
    }
  );

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  } catch {
    // Supabase injoignable ou trop lent : on laisse passer, la page vérifiera.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
