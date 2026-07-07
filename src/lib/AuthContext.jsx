import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return null;
    }

    let { data, error } = await supabase
      .from("football_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!data && !error) {
      const { data: created } = await supabase
        .from("football_profiles")
        .upsert({ id: userId })
        .select()
        .single();
      data = created;
    }

    setProfile(data || null);
    return data || null;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) await loadProfile(data.session.user.id);
      setIsLoadingAuth(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = (email, password) => supabase.auth.signUp({ email, password });
  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  const refreshProfile = () => loadProfile(session?.user?.id);

  /** Player-role accounts track themselves as a player; make sure that row exists. */
  const ensureSelfPlayer = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return null;

    const { data: existing } = await supabase
      .from("football_players")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created } = await supabase
      .from("football_players")
      .insert({ user_id: userId, name: profile?.full_name || "Me" })
      .select("id")
      .single();

    return created?.id || null;
  }, [session, profile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role: profile?.role || "player",
        isAuthenticated: !!session,
        isLoadingAuth,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        ensureSelfPlayer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
