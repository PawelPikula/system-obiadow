"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  
  // Nowy stan: null oznacza widok listy firm. 
  // Konkretne ID (lub 'unassigned') otwiera widok pracowników danej grupy.
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    const { data: usersData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, company_id');

    const { data: companiesData } = await supabase
      .from('companies')
      .select('id, name');

    setUsers(usersData || []);
    setCompanies(companiesData || []);
    setLoading(false);
  }

  async function assignCompany(userId, newCompanyId) {
    setUpdatingId(userId);
    
    const { error } = await supabase
      .from('profiles')
      .update({ company_id: newCompanyId === 'null' ? null : newCompanyId })
      .eq('id', userId);

    if (error) {
      toast.error('Nie udało się zapisać przypisania: ' + error.message);
    } else {
      toast.success('Zaktualizowano przypisanie.');
      setUsers(users.map(u => u.id === userId ? { ...u, company_id: newCompanyId === 'null' ? null : newCompanyId } : u));
    }
    
    setUpdatingId(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // --- WIDOK 1: LISTA FIRM ---
  if (selectedCompanyId === null) {
    const unassignedUsersCount = users.filter(u => !u.company_id).length;

    return (
      <main className="min-h-screen relative bg-gradient-premium p-6 md:p-12 font-sans text-slate-800 overflow-hidden">
        {/* Animowane tła (blobs) */}
        <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
        <div className="absolute top-20 -right-10 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" style={{ animationDelay: '2s' }} />

        <div className="max-w-4xl mx-auto relative z-10 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 glass p-6 rounded-3xl gap-4">
            <h1 className="text-3xl font-heading font-black text-slate-800 flex items-center gap-3">
              <span className="text-4xl">💼</span> Panel Administratora
            </h1>
            <Link href="/" className="px-5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm">Wróć do sklepu</Link>
          </div>

          <h2 className="text-xl font-bold mb-6 text-slate-700 px-2 animate-slide-up">Wybierz grupę:</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {/* Specjalny kafelek dla oczekujących */}
            <div 
              onClick={() => setSelectedCompanyId('unassigned')}
              className="glass border-2 border-orange-200/50 p-6 rounded-3xl cursor-pointer hover:border-orange-300 hover:bg-white/80 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-xl flex justify-between items-center"
            >
              <div>
                <h3 className="text-xl font-heading font-black text-orange-600">Nowi użytkownicy</h3>
                <p className="text-slate-500 font-medium text-sm mt-1">Oczekujący na przypisanie</p>
              </div>
              <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30 font-black text-2xl h-14 w-14 rounded-full flex items-center justify-center">
                {unassignedUsersCount}
              </div>
            </div>

            {/* Kafelki dla konkretnych firm */}
            {companies.map((company, index) => {
              const employeesCount = users.filter(u => u.company_id === company.id).length;
              return (
                <div 
                  key={company.id}
                  onClick={() => setSelectedCompanyId(company.id)}
                  className="glass border border-slate-200/50 p-6 rounded-3xl cursor-pointer hover:border-blue-300 hover:bg-white/80 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-xl flex justify-between items-center animate-slide-up"
                  style={{ animationDelay: `${(index + 2) * 0.1}s` }}
                >
                  <div>
                    <h3 className="text-xl font-heading font-black text-slate-800">{company.name}</h3>
                    <p className="text-slate-500 font-medium text-sm mt-1">Aktywnych kont</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 font-black text-2xl h-14 w-14 rounded-full flex items-center justify-center">
                    {employeesCount}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // --- WIDOK 2: LISTA PRACOWNIKÓW W WYBRANEJ FIRMIE ---
  const isUnassignedView = selectedCompanyId === 'unassigned';
  const displayedUsers = users.filter(u => isUnassignedView ? !u.company_id : u.company_id === selectedCompanyId);
  const companyName = isUnassignedView ? 'Oczekujący pracownicy' : companies.find(c => c.id === selectedCompanyId)?.name;

  return (
    <main className="min-h-screen relative bg-gradient-premium p-6 md:p-12 font-sans text-slate-800 overflow-hidden">
      {/* Animowane tła (blobs) */}
      <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div className="absolute top-20 -right-10 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" style={{ animationDelay: '2s' }} />

      <div className="max-w-4xl mx-auto relative z-10 animate-fade-in">
        <div className="flex items-center gap-6 mb-8 glass p-6 rounded-3xl">
          <button 
            onClick={() => setSelectedCompanyId(null)}
            className="bg-white/60 px-5 py-2.5 rounded-xl font-bold text-slate-600 shadow-sm border border-slate-200/50 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm flex items-center gap-2"
          >
            <span className="text-lg leading-none">←</span> Wróć
          </button>
          <h1 className="text-2xl font-heading font-black text-slate-800">{companyName}</h1>
        </div>

        <div className="glass rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="bg-white/40 px-8 py-5 border-b border-slate-200/50 grid grid-cols-2 gap-4 font-bold text-slate-500 text-xs uppercase tracking-widest">
            <div>Pracownik</div>
            <div>Zmień przydział</div>
          </div>

          {displayedUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">
              Brak pracowników w tej grupie.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200/50">
              {displayedUsers.map((user) => (
                <li key={user.id} className="px-8 py-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-white/60 transition-colors gap-4">
                  <span className="font-bold text-lg text-slate-800">{user.first_name} {user.last_name}</span>
                  
                  <div className="flex items-center gap-4 w-full md:w-1/2">
                    <select
                      className="w-full p-3 rounded-xl border-2 font-semibold bg-white/50 border-slate-200 text-slate-700 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer hover:bg-white"
                      value={user.company_id || 'null'}
                      onChange={(e) => assignCompany(user.id, e.target.value)}
                      disabled={updatingId === user.id}
                    >
                      <option value="null" className="font-medium">-- Usuń przypisanie --</option>
                      {companies.map(company => (
                        <option key={company.id} value={company.id} className="font-medium">
                          {company.name}
                        </option>
                      ))}
                    </select>
                    
                    <div className="w-6 flex justify-center">
                      {updatingId === user.id && (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"></div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}