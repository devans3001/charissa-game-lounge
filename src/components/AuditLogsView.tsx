import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatLagosDateTime, formatLagosDate } from '../lib/utils.ts';
import {
  ShieldCheck,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
  User,
  Clock,
  Eye,
  X
} from 'lucide-react';

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [entityType, setEntityType] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, [page, entityType, action, startDate, endDate]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.auditLogs.list({
        page,
        limit: 25,
        search,
        entityType,
        action,
        startDate,
        endDate,
      });
      setLogs(res.logs);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Security & Financial Audit Trail
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable log answering: Who did what, when, previous vs new values, and authorization reasons
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search action name, staff member, entity ID, or reason..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer shrink-0"
          >
            Search Logs
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
          <select
            value={entityType}
            onChange={e => { setEntityType(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none"
          >
            <option value="">All Entities</option>
            <option value="TRANSACTION">Transactions</option>
            <option value="GAME">Games & Pricing</option>
            <option value="USER">User / Cashiers</option>
            <option value="RECONCILIATION">Reconciliation</option>
            <option value="CORRECTION_REQUEST">Correction Requests</option>
            <option value="SYSTEM">System</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none font-mono"
            placeholder="From Date"
          />

          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none font-mono"
            placeholder="To Date"
          />

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setEntityType('');
              setAction('');
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                <th className="py-3 px-4 font-semibold">Timestamp (Lagos)</th>
                <th className="py-3 px-4 font-semibold">Actor / Staff</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Entity</th>
                <th className="py-3 px-4 font-semibold">Audit Notes / Reason</th>
                <th className="py-3 px-4 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                    {formatLagosDateTime(log.timestamp)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-sans">
                    <span className="font-semibold text-white">{log.actorName}</span>
                    <span className="text-[11px] text-slate-400 ml-1.5 font-mono">({log.actorRole})</span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="text-indigo-400 font-semibold">{log.action}</span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-300">
                    {log.entityType}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300 max-w-xs truncate">
                    {log.reason || (log.newValues ? JSON.stringify(log.newValues) : '—')}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Inspect log payload"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-sans">
                    No audit records found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {logs.length} of {total} entries (Page {page} of {totalPages})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Log Payload Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">Audit Record Inspector</h3>
            <p className="text-xs text-slate-400 font-mono mb-4">{selectedLog.id}</p>

            <div className="space-y-3 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp:</span>
                <span>{formatLagosDateTime(selectedLog.timestamp)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Actor:</span>
                <span>{selectedLog.actorName} ({selectedLog.actorRole})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Action:</span>
                <span className="text-indigo-400 font-bold">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Entity:</span>
                <span>{selectedLog.entityType} ({selectedLog.entityId})</span>
              </div>

              {selectedLog.reason && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-400 block mb-1">Recorded Reason / Motivation:</span>
                  <div className="p-2 bg-slate-900 rounded text-slate-200 font-sans">{selectedLog.reason}</div>
                </div>
              )}

              {selectedLog.previousValues && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-rose-400 block mb-1">Previous Values Snapshot:</span>
                  <pre className="p-2 bg-slate-900 rounded overflow-x-auto text-[11px] text-slate-300">
                    {JSON.stringify(selectedLog.previousValues, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.newValues && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-emerald-400 block mb-1">New Values Snapshot:</span>
                  <pre className="p-2 bg-slate-900 rounded overflow-x-auto text-[11px] text-slate-300">
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
