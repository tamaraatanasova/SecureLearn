import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (userId) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      return data || null;
    };

    const ensureProfile = async (user) => {
      if (!user) return;
      const { data: existing, error: selectError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (selectError || existing) return;

      await supabase.from("profiles").insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setIsLoading(false);
      if (data.session?.user) {
        ensureProfile(data.session.user).then(async () => {
          const nextProfile = await loadProfile(data.session.user.id);
          if (isMounted) setProfile(nextProfile);
        });
      } else {
        setProfile(null);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      if (nextSession?.user) {
        ensureProfile(nextSession.user).then(async () => {
          const nextProfile = await loadProfile(nextSession.user.id);
          if (isMounted) setProfile(nextProfile);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signup = async (email, password) => {
    const preferred = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "teacher",
        },
      },
    });

    if (preferred.error?.message === "Database error saving new user") {
      return supabase.auth.signUp({ email, password });
    }

    return preferred;
  };
  const logout = () => supabase.auth.signOut();

  const value = useMemo(
    () => ({
      session,
      profile,
      isAuthed: Boolean(session?.user),
      isLoading,
      role: profile?.role || "student",
      isTeacher: profile?.role === "teacher",
      isAdmin: profile?.role === "admin",
      login,
      signup,
      logout,
    }),
    [session, profile, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
