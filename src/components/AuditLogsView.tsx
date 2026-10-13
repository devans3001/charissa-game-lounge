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
  X,
  LayoutGrid,
  List
} from 'lucide-react';

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'AUTO' | 'CARD' | 'TABLE'>('AUTO');

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
    <div className="space-y-5">
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

        {/* View Toggle */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'CARD' ? 'AUTO' : 'CARD')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[36px] ${
              viewMode === 'CARD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'TABLE' ? 'AUTO' : 'TABLE')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[36px] ${
              viewMode === 'TABLE' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search action name, staff member, entity ID, or reason..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none min-h-[42px]"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer shrink-0 min-h-[42px]"
          >
            Search Logs
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
          <select
            value={entityType}
            onChange={e => { setEntityType(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none min-h-[40px] text-xs"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none font-mono min-h-[40px] text-xs"
            placeholder="From Date"
          />

          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none font-mono min-h-[40px] text-xs"
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
            className="px-3 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition min-h-[40px] text-xs"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Main Logs Container: Dual Presentation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* RESPONSIVE CARDS VIEW (Mobile < md: or explicit CARD mode) */}
        <div className={`${viewMode === 'TABLE' ? 'hidden' : viewMode === 'CARD' ? 'block' : 'block md:hidden'} divide-y divide-slate-800/80 p-3 sm:p-4 space-y-3`}>
          {logs.map(log => (
            <div
              key={log.id}
              className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 transition space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-indigo-400 font-bold font-mono text-xs">
                      {log.action}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {log.entityType}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {formatLagosDateTime(log.timestamp)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
                  title="Inspect log details"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs">
                <span className="text-slate-400">Actor: </span>
                <strong className="text-white font-sans">{log.actorName}</strong>
                <span className="text-slate-400 font-mono text-[11px] ml-1">({log.actorRole})</span>
              </div>

              {log.reason && (
                <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 font-sans">
                  <span className="text-slate-400 text-[11px] block mb-0.5">Audit Note / Reason:</span>
                  {log.reason}
                </div>
              )}
            </div>
          ))}

          {logs.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No audit records found matching criteria.
            </div>
          )}
        </div>

        {/* DESKTOP TABLE VIEW (md:+ or explicit TABLE mode) */}
        <div className={`${viewMode === 'CARD' ? 'hidden' : viewMode === 'TABLE' ? 'block' : 'hidden md:block'} overflow-x-auto`}>
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Timestamp (Lagos)</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Actor / Staff</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Action</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Entity</th>
                <th className="py-3 px-4 font-semibold">Audit Notes / Reason</th>
                <th className="py-3 px-4 font-semibold text-right whitespace-nowrap">Details</th>
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
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition min-w-[34px] min-h-[34px] inline-flex items-center justify-center cursor-pointer"
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
        <div className="p-3.5 sm:p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{logs.length}</strong> of <strong className="text-white">{total}</strong> entries (Page {page} of {totalPages})
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition flex items-center gap-1 min-h-[36px]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>
            <span className="font-mono px-2 text-white font-semibold">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition flex items-center gap-1 min-h-[36px]"
            >
              <span>Next</span>
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
