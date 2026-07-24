import { useState, useEffect } from 'react';
import type { Role } from '../types';

interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

const STORAGE_KEY = 'parish_current_user';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      setUser(null);
    }
  }, []);

  const role = user?.role;

  const can = (...roles: Role[]) => {
    if (!role) return false;
    return roles.includes(role);
  };

  const isAdmin = can('admin');
  const isChunhiem = can('chunhiem');
  const isPhuta = can('phuta');
  const isPhuhuynh = can('phuhuynh');

  return { user, role, can, isAdmin, isChunhiem, isPhuta, isPhuhuynh };
}
