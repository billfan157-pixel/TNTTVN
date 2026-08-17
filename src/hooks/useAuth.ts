import type { Role } from '../types';
import { useAuthStore, type AuthUser } from '../stores/authStore';

export function useAuth() {
  const user = useAuthStore((s) => s.user);

  const role = user?.role;

  const can = (...roles: Role[]) => {
    if (!role) return false;
    return roles.includes(role);
  };

  const isAdmin = can('admin');
  const isChunhiem = can('chunhiem');
  const isPhuta = can('phuta');
  const isPhuhuynh = can('phuhuynh');

  return { user: user as AuthUser | null, role, can, isAdmin, isChunhiem, isPhuta, isPhuhuynh };
}
