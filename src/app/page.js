import { supabase } from '../lib/supabase';
import MenuCart from '../components/MenuCart';

export default async function Home() {
  // Pobieramy menu
  const { data: menuItems, error: menuError } = await supabase.from('menu_items').select('*');
  
  // Pobieramy profile ORAZ złączamy je z tabelą companies!
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select(`
    id, 
    first_name, 
    last_name,
    companies ( name, payment_model, daily_subsidy )
  `);

  return (
    <main className="p-4 md:p-10 font-sans min-h-screen bg-slate-100 flex flex-col items-center">
      <h1 className="text-3xl font-bold mt-4 mb-8 text-blue-600 text-center">System Zamówień B2B</h1>
      
      {menuError || profilesError ? (
        <p className="text-red-500">Błąd: Problem z pobraniem danych.</p>
      ) : (
        <MenuCart items={menuItems} profiles={profiles} />
      )}
    </main>
  );
}