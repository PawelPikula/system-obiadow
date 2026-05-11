import { redirect } from 'next/navigation';
import { getSessionWithRole } from '@/lib/supabaseServer';

// Wpuszcza role 'restaurant' i 'admin'.
export default async function KuchniaLayout({ children }) {
  const session = await getSessionWithRole();
  if (!session) redirect('/login');
  const role = session.profile?.role;
  if (role !== 'restaurant' && role !== 'admin') redirect('/');
  return children;
}
