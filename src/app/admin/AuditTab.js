"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

export default function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          created_at,
          action,
          target_id,
          old_value,
          new_value,
          details,
          actor:actor_id (first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Błąd pobierania logów:', error);
      toast.error('Nie udało się pobrać logów audytowych.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden animate-slide-up">
      <div className="bg-white/40 px-6 py-4 border-b border-slate-200/50 grid grid-cols-4 gap-4 font-bold text-slate-500 text-[10px] uppercase tracking-widest">
        <div>Data</div>
        <div>Akcja</div>
        <div>Szczegóły</div>
        <div>Wykonawca</div>
      </div>

      {logs.length === 0 ? (
        <div className="p-12 text-center text-slate-500 font-medium">Brak zapisanych logów.</div>
      ) : (
        <ul className="divide-y divide-slate-200/50">
          {logs.map((log) => (
            <li key={log.id} className="px-6 py-4 grid grid-cols-4 gap-4 items-center hover:bg-white/60 transition-colors">
              <div className="text-xs text-slate-500 font-medium">
                {new Date(log.created_at).toLocaleString('pl-PL')}
              </div>
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  log.action === 'profile_update' ? 'bg-blue-100 text-blue-600' :
                  log.action === 'company_update' ? 'bg-purple-100 text-purple-600' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {log.action}
                </span>
              </div>
              <div className="text-sm text-slate-700 font-bold">
                {log.details}
              </div>
              <div className="text-sm text-slate-500 font-medium">
                {log.actor ? `${log.actor.first_name} ${log.actor.last_name}` : 'System'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
