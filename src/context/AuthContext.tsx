// src/context/AuthContext.tsx
import {
  onAuthStateChanged,
} from "firebase/auth";
import { auth, db } from "../assets/firebase";
import {
  collection,
  doc,
  getDoc,
} from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";

type Role = "admin" | "judge";

type AppUser = {
  uid: string;
  displayName: string | null;
  role: Role;
};

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        // get role from Firestore: users/{uid}
        const userRef = doc(collection(db, "users"), fbUser.uid);
        const snap = await getDoc(userRef);

        const role = (snap.exists() ? snap.data().role : "judge") as Role;

        setUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          role,
        });
      } catch (error) {
        console.error("Error fetching user role:", error);
        // Default to judge role if there's an error
        setUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          role: "judge",
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
