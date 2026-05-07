"use client";
import { useState, useEffect } from 'react';
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
      alert("Błąd podczas zapisywania: " + error.message);
    } else {
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
      <main className="min-h-screen bg-slate-100 p-6 md:p-12 font-sans text-slate-800">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800">💼 Panel Administratora</h1>
            <a href="/" className="text-blue-600 font-semibold hover:underline">Wróć do sklepu</a>
          </div>

          <h2 className="text-xl font-semibold mb-4 text-slate-600">Wybierz grupę:</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Specjalny kafelek dla oczekujących */}
            <div 
              onClick={() => setSelectedCompanyId('unassigned')}
              className="bg-orange-50 border-2 border-orange-200 p-6 rounded-2xl cursor-pointer hover:bg-orange-100 hover:border-orange-300 transition shadow-sm flex justify-between items-center"
            >
              <div>
                <h3 className="text-lg font-bold text-orange-800">Nowi użytkownicy</h3>
                <p className="text-orange-600 text-sm mt-1">Oczekujący na przypisanie</p>
              </div>
              <div className="bg-orange-200 text-orange-800 font-black text-xl h-12 w-12 rounded-full flex items-center justify-center">
                {unassignedUsersCount}
              </div>
            </div>

            {/* Kafelki dla konkretnych firm */}
            {companies.map(company => {
              const employeesCount = users.filter(u => u.company_id === company.id).length;
              return (
                <div 
                  key={company.id}
                  onClick={() => setSelectedCompanyId(company.id)}
                  className="bg-white border-2 border-transparent p-6 rounded-2xl cursor-pointer hover:border-blue-200 hover:shadow-md transition shadow-sm flex justify-between items-center"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{company.name}</h3>
                    <p className="text-slate-500 text-sm mt-1">Aktywnych kont</p>
                  </div>
                  <div className="bg-slate-100 text-slate-600 font-bold text-xl h-12 w-12 rounded-full flex items-center justify-center">
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
    <main className="min-h-screen bg-slate-100 p-6 md:p-12 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setSelectedCompanyId(null)}
            className="bg-white px-4 py-2 rounded-lg font-semibold text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
          >
            ← Wróć do firm
          </button>
          <h1 className="text-2xl font-bold text-slate-800">{companyName}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 grid grid-cols-2 gap-4 font-semibold text-slate-600 text-sm uppercase tracking-wider">
            <div>Pracownik</div>
            <div>Zmień przydział</div>
          </div>

          {displayedUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium">
              Brak pracowników w tej grupie.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {displayedUsers.map((user) => (
                <li key={user.id} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <span className="font-bold text-lg">{user.first_name} {user.last_name}</span>
                  
                  <div className="flex items-center gap-3 w-1/2">
                    <select
                      className="w-full p-2.5 rounded-lg border font-medium bg-slate-50 border-slate-300 text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                      value={user.company_id || 'null'}
                      onChange={(e) => assignCompany(user.id, e.target.value)}
                      disabled={updatingId === user.id}
                    >
                      <option value="null">-- Usuń przypisanie --</option>
                      {companies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                    
                    <div className="w-5">
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