import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState(null);

  // ✅ Load user from localStorage
  useEffect(() => {
    const name = localStorage.getItem("fb_name");
    const role = localStorage.getItem("fb_role");

    if (name) {
      setUser({ name, role });
      setIsAuthenticated(true);
    }
  }, []);

  // ✅ Simple login
  const login = (name, role = "player") => {
    localStorage.setItem("fb_name", name);
    localStorage.setItem("fb_role", role);

    setUser({ name, role });
    setIsAuthenticated(true);
  };

  // ✅ Simple logout
  const logout = () => {
    localStorage.removeItem("fb_name");
    localStorage.removeItem("fb_role");
    localStorage.removeItem("fb_dob");

    setUser(null);
    setIsAuthenticated(false);

    window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ✅ Hook
export const useAuth = () => {
  return useContext(AuthContext);
};