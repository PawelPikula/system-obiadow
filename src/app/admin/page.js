"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import AuditTab from './AuditTab';

const ROLE_LABELS = {
  employee: { label: 'Pracownik', color: 'bg-slate-100 text-slate-600' },
  restaurant: { label: 'Kuchnia', color: 'bg-orange-100 text-orange-700' },
  admin: { label: 'Admin', color: 'bg-purple-100 text-purple-700' },
};

export default function AdminPanel() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  // Nowa firma
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newPaymentModel, setNewPaymentModel] = useState('salary_deduction');
  const [newSubsidy, setNewSubsidy] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);

  // Edycja firmy
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPaymentModel, setEditPaymentModel] = useState('salary_deduction');
  const [editSubsidy, setEditSubsidy] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || profile?.role !== 'admin') {
        toast.error('Brak uprawnień administratora.');
        router.replace('/');
        return;
      }

      const [{ data: usersData, error: usersError }, { data: companiesData, error: companiesError }] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, company_id, role'),
        supabase.from('companies').select('id, name, payment_model, daily_subsidy'),
      ]);

      if (usersError) throw usersError;
      if (companiesError) throw companiesError;

      setUsers(usersData || []);
      setCompanies(companiesData || []);
    } catch (error) {
      console.error('Błąd pobierania danych admina:', error);
      toast.error('Nie udało się pobrać danych: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function assignCompany(userId, newCompanyId) {
    setUpdatingId(userId);
    const value = newCompanyId === 'null' ? null : newCompanyId;
    const { error } = await supabase.from('profiles').update({ company_id: value }).eq('id', userId);
    if (error) {
      toast.error('Nie udało się zapisać przypisania: ' + error.message);
    } else {
      toast.success('Zaktualizowano przypisanie.');
      setUsers(users.map(u => u.id === userId ? { ...u, company_id: value } : u));
    }
    setUpdatingId(null);
  }

  async function changeRole(userId, newRole) {
    setUpdatingId(userId + '_role');
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) {
      toast.error('Nie udało się zmienić roli: ' + error.message);
    } else {
      toast.success('Rola zaktualizowana.');
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    }
    setUpdatingId(null);
  }

  async function addCompany(e) {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    setAddingCompany(true);
    const { data, error } = await supabase
      .from('companies')
      .insert([{
        name: newCompanyName.trim(),
        payment_model: newPaymentModel,
        daily_subsidy: parseFloat(newSubsidy) || 0,
      }])
      .select()
      .single();
    if (error) {
      toast.error('Nie udało się dodać firmy: ' + error.message);
    } else {
      toast.success('Firma dodana!');
      setCompanies([...companies, data]);
      setNewCompanyName('');
      setNewSubsidy('');
    }
    setAddingCompany(false);
  }

  function startEdit(company) {
    setEditingCompanyId(company.id);
    setEditName(company.name);
    setEditPaymentModel(company.payment_model || 'salary_deduction');
    setEditSubsidy(String(company.daily_subsidy || ''));
  }

  async function saveCompanyEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: editName.trim(),
        payment_model: editPaymentModel,
        daily_subsidy: parseFloat(editSubsidy) || 0,
      })
      .eq('id', editingCompanyId);
    if (error) {
      toast.error('Nie udało się zapisać: ' + error.message);
    } else {
      toast.success('Firma zaktualizowana.');
      setCompanies(companies.map(c =>
        c.id === editingCompanyId
          ? { ...c, name: editName.trim(), payment_model: editPaymentModel, daily_subsidy: parseFloat(editSubsidy) || 0 }
          : c
      ));
      setEditingCompanyId(null);
    }
    setSavingEdit(false);
  }

  async function deleteCompany(companyId, companyName) {
    const hasUsers = users.some(u => u.company_id === companyId);
    if (hasUsers) {
      toast.error('Nie można usunąć firmy z przypisanymi pracownikami.');
      return;
    }
    if (!confirm(`Czy na pewno usunąć firmę "${companyName}"?`)) return;
    const { error } = await supabase.from('companies').delete().eq('id', companyId);
    if (error) {
      toast.error('Nie udało się usunąć firmy: ' + error.message);
    } else {
      toast.success('Firma usunięta.');
      setCompanies(companies.filter(c => c.id !== companyId));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  // --- WIDOK SZCZEGÓŁOWY FIRMY ---
  if (selectedCompanyId !== null && activeTab === 'users') {
    const isUnassigned = selectedCompanyId === 'unassigned';
    const displayedUsers = users.filter(u => isUnassigned ? !u.company_id : u.company_id === selectedCompanyId);
    const companyName = isUnassigned ? 'Oczekujący pracownicy' : companies.find(c => c.id === selectedCompanyId)?.name;

    return (
      <main className="min-h-screen relative bg-gradient-premium p-6 md:p-12 font-sans text-slate-800 overflow-hidden">
        <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
        <div className="absolute top-20 -right-10 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" style={{ animationDelay: '2s' }} />

        <div className="max-w-4xl mx-auto relative z-10 animate-fade-in">
          <div className="flex items-center gap-4 mb-8 glass p-6 rounded-3xl flex-wrap">
            <button
              onClick={() => setSelectedCompanyId(null)}
              className="bg-white/60 px-5 py-2.5 rounded-xl font-bold text-slate-600 shadow-sm border border-slate-200/50 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm flex items-center gap-2"
            >
              <span>←</span> Wróć
            </button>
            <h1 className="text-2xl font-heading font-black text-slate-800">{companyName}</h1>
            <span className="ml-auto text-sm font-bold text-slate-500">{displayedUsers.length} os.</span>
          </div>

          <div className="glass rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden animate-slide-up">
            <div className="bg-white/40 px-6 py-4 border-b border-slate-200/50 grid grid-cols-3 gap-4 font-bold text-slate-500 text-xs uppercase tracking-widest">
              <div>Pracownik</div>
              <div>Rola</div>
              <div>Firma</div>
            </div>

            {displayedUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">Brak pracowników w tej grupie.</div>
            ) : (
              <ul className="divide-y divide-slate-200/50">
                {displayedUsers.map((user) => {
                  const roleInfo = ROLE_LABELS[user.role] || ROLE_LABELS.employee;
                  return (
                    <li key={user.id} className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-center hover:bg-white/60 transition-colors">
                      <span className="font-bold text-lg text-slate-800">{user.first_name} {user.last_name}</span>

                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${roleInfo.color}`}>{roleInfo.label}</span>
                        <select
                          className="flex-1 p-2 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                          value={user.role}
                          onChange={(e) => changeRole(user.id, e.target.value)}
                          disabled={updatingId === user.id + '_role'}
                        >
                          <option value="employee">Pracownik</option>
                          <option value="restaurant">Kuchnia</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          className="flex-1 p-2 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                          value={user.company_id || 'null'}
                          onChange={(e) => assignCompany(user.id, e.target.value)}
                          disabled={updatingId === user.id}
                        >
                          <option value="null">-- Usuń przypisanie --</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {(updatingId === user.id || updatingId === user.id + '_role') && (
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-blue-600 shrink-0" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    );
  }

  const unassignedCount = users.filter(u => !u.company_id).length;

  return (
    <main className="min-h-screen relative bg-gradient-premium p-6 md:p-12 font-sans text-slate-800 overflow-hidden">
      <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div className="absolute top-20 -right-10 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" style={{ animationDelay: '2s' }} />

      <div className="max-w-4xl mx-auto relative z-10 animate-fade-in">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 glass p-6 rounded-3xl gap-4">
          <h1 className="text-3xl font-heading font-black text-slate-800 flex items-center gap-3">
            <span className="text-4xl">💼</span> Panel Administratora
          </h1>
          <div className="flex gap-2">
            <Link href="/" className="px-5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm">
              Wróć do sklepu
            </Link>
            <button onClick={handleLogout} className="px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-600 hover:bg-red-100 hover:shadow-md transition-all">
              Wyloguj
            </button>
          </div>
        </div>

        {/* ZAKŁADKI */}
        <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl backdrop-blur-sm border border-slate-200/50 mb-8">
          <button
            onClick={() => { setActiveTab('users'); setSelectedCompanyId(null); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'users' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
          >
            👥 Pracownicy
          </button>
          <button
            onClick={() => { setActiveTab('companies'); setSelectedCompanyId(null); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'companies' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
          >
            🏢 Firmy
          </button>
          <button
            onClick={() => { setActiveTab('audit'); setSelectedCompanyId(null); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'audit' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
          >
            📝 Logi audytowe
          </button>
        </div>

        {/* ZAKŁADKA: PRACOWNICY */}
        {activeTab === 'users' && (
          <>
            <h2 className="text-xl font-bold mb-5 text-slate-700 px-1">Wybierz grupę:</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slide-up">
              <div
                onClick={() => setSelectedCompanyId('unassigned')}
                className="glass border-2 border-orange-200/50 p-6 rounded-3xl cursor-pointer hover:border-orange-300 hover:bg-white/80 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-xl flex justify-between items-center"
              >
                <div>
                  <h3 className="text-xl font-heading font-black text-orange-600">Nowi użytkownicy</h3>
                  <p className="text-slate-500 font-medium text-sm mt-1">Oczekujący na przypisanie</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30 font-black text-2xl h-14 w-14 rounded-full flex items-center justify-center shrink-0">
                  {unassignedCount}
                </div>
              </div>

              {companies.map((company, index) => {
                const count = users.filter(u => u.company_id === company.id).length;
                return (
                  <div
                    key={company.id}
                    onClick={() => setSelectedCompanyId(company.id)}
                    className="glass border border-slate-200/50 p-6 rounded-3xl cursor-pointer hover:border-blue-300 hover:bg-white/80 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-xl flex justify-between items-center animate-slide-up"
                    style={{ animationDelay: `${(index + 1) * 0.08}s` }}
                  >
                    <div>
                      <h3 className="text-xl font-heading font-black text-slate-800">{company.name}</h3>
                      <p className="text-slate-500 font-medium text-sm mt-1">
                        {count} {count === 1 ? 'pracownik' : 'pracowników'}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 font-black text-2xl h-14 w-14 rounded-full flex items-center justify-center shrink-0">
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ZAKŁADKA: FIRMY */}
        {activeTab === 'companies' && (
          <div className="animate-slide-up">
            {/* FORMULARZ DODAWANIA */}
            <div className="glass p-6 rounded-3xl mb-6 border border-slate-200/50">
              <h2 className="text-lg font-heading font-black text-slate-800 mb-5">Dodaj nową firmę</h2>
              <form onSubmit={addCompany} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Nazwa firmy</label>
                  <input
                    type="text"
                    required
                    placeholder="Nazwa sp. z o.o."
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Model płatności</label>
                  <select
                    value={newPaymentModel}
                    onChange={(e) => setNewPaymentModel(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                  >
                    <option value="salary_deduction">Potrącenie z wypłaty</option>
                    <option value="blik">BLIK</option>
                    <option value="prepaid">Przedpłata</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Dofinansowanie dzienne (zł)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newSubsidy}
                    onChange={(e) => setNewSubsidy(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={addingCompany}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:-translate-y-0.5 hover:shadow-xl transition-all disabled:opacity-50 disabled:transform-none"
                  >
                    {addingCompany ? 'Dodawanie…' : '+ Dodaj firmę'}
                  </button>
                </div>
              </form>
            </div>

            {/* LISTA FIRM */}
            <div className="glass rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
              <div className="bg-white/40 px-6 py-4 border-b border-slate-200/50 grid grid-cols-4 gap-4 font-bold text-slate-500 text-xs uppercase tracking-widest">
                <div className="col-span-2">Firma</div>
                <div>Dofinansowanie</div>
                <div>Akcje</div>
              </div>
              {companies.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-medium">Brak firm. Dodaj pierwszą powyżej.</div>
              ) : (
                <ul className="divide-y divide-slate-200/50">
                  {companies.map((company) => {
                    const employeeCount = users.filter(u => u.company_id === company.id).length;
                    const isEditing = editingCompanyId === company.id;
                    const paymentLabel = { salary_deduction: 'Potrącenie z wypłaty', blik: 'BLIK', prepaid: 'Przedpłata' };
                    return (
                      <li key={company.id} className="px-6 py-4 hover:bg-white/60 transition-colors">
                        {isEditing ? (
                          <form onSubmit={saveCompanyEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <input
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              required
                              className="p-2.5 rounded-xl border border-blue-300 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                              placeholder="Nazwa firmy"
                            />
                            <div className="flex gap-2">
                              <select
                                value={editPaymentModel}
                                onChange={e => setEditPaymentModel(e.target.value)}
                                className="flex-1 p-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                              >
                                <option value="salary_deduction">Potrącenie</option>
                                <option value="blik">BLIK</option>
                                <option value="prepaid">Przedpłata</option>
                              </select>
                              <input
                                type="number" min="0" step="0.01"
                                value={editSubsidy}
                                onChange={e => setEditSubsidy(e.target.value)}
                                className="w-24 p-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                                placeholder="Dotacja"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={savingEdit} className="flex-1 bg-blue-600 text-white text-sm font-bold px-3 py-2.5 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50">
                                {savingEdit ? '…' : 'Zapisz'}
                              </button>
                              <button type="button" onClick={() => setEditingCompanyId(null)} className="flex-1 bg-slate-100 text-slate-600 text-sm font-bold px-3 py-2.5 rounded-xl hover:bg-slate-200 transition-all">
                                Anuluj
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="grid grid-cols-4 gap-4 items-center">
                            <div className="col-span-2">
                              <p className="font-bold text-slate-800">{company.name}</p>
                              <p className="text-xs text-slate-400 font-medium mt-0.5">
                                {paymentLabel[company.payment_model] || company.payment_model} · {employeeCount} prac.
                              </p>
                            </div>
                            <span className="text-sm font-black text-green-600">
                              {(company.daily_subsidy || 0).toFixed(2)} zł
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEdit(company)}
                                className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                Edytuj
                              </button>
                              <button
                                onClick={() => deleteCompany(company.id, company.name)}
                                className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                Usuń
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
        {/* ZAKŁADKA: LOGI AUDYTOWE */}
        {activeTab === 'audit' && (
          <div className="animate-slide-up">
            <h2 className="text-xl font-bold mb-5 text-slate-700 px-1">Ostatnia aktywność w systemie:</h2>
            <AuditTab />
          </div>
        )}
      </div>
    </main>
  );
}
