import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [org, setOrg] = useState(null);

  const loadOrg = useCallback(async (userId) => {
    if (!userId) {
      setOrg(null);
      return null;
    }

    // A coach can technically belong to more than one org via join-by-code,
    // but this app only ever acts on one "current" org at a time — the
    // oldest membership, so switching never happens implicitly out from
    // under a coach mid-session.
    const { data } = await supabase
      .from("football_org_members")
      .select("role, joined_at, football_organizations(id, name, invite_code, owner_id)")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const found = data?.football_organizations ? { ...data.football_organizations, myRole: data.role } : null;
    setOrg(found);
    return found;
  }, []);

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
    // A single source of truth: onAuthStateChange fires once immediately with
    // whatever session already exists (including one just parsed from an OAuth
    // redirect's URL hash), then again on every subsequent change. Racing this
    // against a separate getSession() call was the bug — right after a fresh
    // OAuth callback, getSession() could resolve first with a stale/empty
    // session and flip isLoadingAuth to false before the real one landed,
    // letting a route render with no user yet.
    let resolvedFirstState = false;

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);

      if (newSession?.user?.id) {
        await loadProfile(newSession.user.id);
        await loadOrg(newSession.user.id);
      } else {
        setProfile(null);
        setOrg(null);
      }

      if (!resolvedFirstState) {
        resolvedFirstState = true;
        setIsLoadingAuth(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile, loadOrg]);

  const signUp = (email, password) => supabase.auth.signUp({ email, password });
  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

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
        signInWithGoogle,
        signOut,
        refreshProfile,
        ensureSelfPlayer,
        org,
        refreshOrg: () => loadOrg(session?.user?.id),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
