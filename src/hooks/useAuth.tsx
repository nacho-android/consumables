import {
  type User,
  type ActionCodeSettings,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { auth, db } from "../lib/firebase";
import type { Profile } from "../types";

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string, settings?: ActionCodeSettings) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    const ref = doc(db, "profiles", user.uid);
    return onSnapshot(
      ref,
      async (snapshot) => {
        if (!snapshot.exists()) {
          setProfile(null);
          setLoading(false);
          await signOut(auth);
          return;
        }
        const nextProfile = { id: snapshot.id, ...snapshot.data() } as Profile;
        if (!nextProfile.active) {
          setProfile(null);
          setLoading(false);
          await signOut(auth);
          return;
        }
        setProfile(nextProfile);
        setLoading(false);
      },
      async () => {
        setProfile(null);
        setLoading(false);
        await signOut(auth);
      }
    );
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string, settings?: ActionCodeSettings) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase(), settings);
  }, []);

  const changePassword = useCallback(async (password: string) => {
    if (!auth.currentUser) throw new Error("Sign in before changing your password.");
    await updatePassword(auth.currentUser, password);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isAdmin: profile?.role === "admin",
      login,
      logout,
      resetPassword,
      changePassword
    }),
    [user, profile, loading, login, logout, resetPassword, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
