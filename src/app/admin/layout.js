import { redirect } from 'next/navigation';
import { getSessionWithRole } from '@/lib/supabaseServer';

// Wpuszcza tylko rolę 'admin'. Niezalogowanych odsyła middleware → /login.
export default async function AdminLayout({ children }) {
  const session = await getSessionWithRole();
  if (!session) redirect('/login');
  if (session.profile?.role !== 'admin') redirect('/');
  return children;
}
