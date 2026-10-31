import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

interface AuthState {
  session: Session | null;
  userId: string | undefined;
  loading: boolean;
}

const Ctx = createContext<AuthState>({ session: null, userId: undefined, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={{ session, userId: session?.user.id, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
