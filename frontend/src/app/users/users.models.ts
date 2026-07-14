import { AuthProvider, EAuth } from '../auth/auth.models';

export interface AdminUserItem {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  role: EAuth;
  active: boolean;
  createdAt: string;
  providers: AuthProvider[];
}
