"use client";

import { createContext, useContext } from "react";
import { canAccessModule, type AppModule } from "@/lib/auth/permissions";

const BackofficeRolesContext = createContext<string[]>([]);

export function BackofficeRolesProvider({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  return (
    <BackofficeRolesContext.Provider value={roles}>
      {children}
    </BackofficeRolesContext.Provider>
  );
}

export function useBackofficeRoles() {
  return useContext(BackofficeRolesContext);
}

export function useCanAccessModule(module: AppModule) {
  const roles = useBackofficeRoles();
  return canAccessModule(roles, module);
}
