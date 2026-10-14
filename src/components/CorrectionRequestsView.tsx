import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CorrectionRequest } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { queryClient, queryKeys } from '../lib/queryClient.ts';
import { formatNaira, formatLagosDateTime } from '../lib/utils.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  FileQuestion,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  User,
  Check,
  X,
  Receipt
} from 'lucide-react';
import { GameTableSkeleton, GameDataLoadingOverlay, GameInlineLoader } from './game-ui/index.ts';

export function CorrectionRequestsView() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review modal
  const [reviewingReq, setReviewingReq] = useState<CorrectionRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState<string>('');


  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.correctionRequests(),
    queryFn: async () => (await api.correctionRequests.list()).requests,
    refetchInterval: 12_000,
  });
  const requests = data || [];

  useEffect(() => {
    if (queryError) setError((queryError as any).message || 'Failed to load correction requests');
  }, [queryError]);

  const reviewMutation = useMutation({
    mutationFn: (vars: { id: string; action: 'APPROVE' | 'REJECT'; notes: string }) =>
      api.correctionRequests.review(vars.id, vars.action, vars.notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correctionRequests'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to review request'),
  });
  const submitting = reviewMutation.isPending;

  const handleReview = async (action: 'APPROVE' | 'REJECT') => {
    if (!reviewingReq) return;

    setError(null);
    try {
      await reviewMutation.mutateAsync({
        id: reviewingReq.id,
        action,
        notes: adminNotes.trim(),
      });
      setSuccessMessage(
        `Correction request for ${reviewingReq.receiptNumber} was ${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}.`
      );
      setReviewingReq(null);
      setAdminNotes('');
    } catch {
      // surfaced through onError
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <FileQuestion className="w-6 h-6 text-amber-400" />
          Correction & Void Requests
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {user?.role === 'ADMIN'
            ? 'Review mistakes flagged by cashiers for authorization'
            : 'Track review status of mistakes you flagged for manager approval'}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Requests list */}
      {loading && requests.length === 0 ? (
        <GameTableSkeleton
          rows={5}
          cols={4}
          title="STREAMING CASHIER FIX TICKETS"
          subtitle="Polling pending void and payment method dispute submissions..."
        />
      ) : (
        <div className="space-y-3">
        {requests.map(req => (
          <div
            key={req.id}
            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-white text-sm">{req.receiptNumber}</span>
                <span className="text-xs text-slate-400">· {req.gameName}</span>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  ({formatNaira(req.amountKobo)})
                </span>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                  req.status === 'PENDING'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : req.status === 'APPROVED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {req.status}
                </span>
              </div>

              <div className="text-xs text-slate-300">
                <span className="text-slate-400">Requested Action: </span>
                <span className="font-semibold text-white">
                  {req.requestedAction === 'VOID'
                    ? 'Void Transaction'
                    : `Change Payment to ${req.proposedPaymentMethod}`}
                </span>
              </div>

              <div className="text-xs text-slate-300">
                <span className="text-slate-400">Cashier Reason: </span>
                <span>"{req.reason}"</span>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center gap-3 font-mono pt-1">
                <span>Submitted by: {req.cashierName}</span>
                <span>·</span>
                <span>{formatLagosDateTime(req.createdAt)}</span>
              </div>

              {req.adminNotes && (
                <div className="text-xs text-indigo-300 pt-1">
                  Manager Review: "{req.adminNotes}" (by {req.reviewedByName})
                </div>
              )}
            </div>

            {/* Action buttons (Admin only for pending) */}
            {user?.role === 'ADMIN' && req.status === 'PENDING' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setReviewingReq(req); setAdminNotes(''); }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Review Request
                </button>
              </div>
            )}
          </div>
        ))}

        {requests.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs bg-slate-900 border border-slate-800 rounded-2xl">
            No correction requests found.
          </div>
        )}
      </div>
      )}

      {/* Review Modal */}
      {reviewingReq && (
        <div onClick={() => setReviewingReq(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setReviewingReq(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">Review Correction Request</h3>
            <p className="text-xs text-slate-400 font-mono mb-4">{reviewingReq.receiptNumber}</p>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs mb-4">
              <div>
                <span className="text-slate-400">Game / Amount: </span>
                <span className="font-semibold text-white">{reviewingReq.gameName} ({formatNaira(reviewingReq.amountKobo)})</span>
              </div>
              <div>
                <span className="text-slate-400">Cashier: </span>
                <span className="text-white">{reviewingReq.cashierName}</span>
              </div>
              <div>
                <span className="text-slate-400">Requested: </span>
                <span className="text-indigo-400 font-semibold">{reviewingReq.requestedAction}</span>
              </div>
              <div>
                <span className="text-slate-400">Reason: </span>
                <span className="text-slate-200">"{reviewingReq.reason}"</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Manager Review Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="e.g. Verified POS terminal slip; card payment confirmed."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReview('REJECT')}
                  className="px-4 py-2 rounded-xl bg-rose-600/20 border border-rose-600/40 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold transition cursor-pointer"
                >
                  Reject Request
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReview('APPROVE')}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer shadow-lg shadow-emerald-600/25"
                >
                  Approve & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game-like HUD async operation overlays */}
      {submitting && (
        <GameDataLoadingOverlay
          label="COMMITTING AUDIT RESOLUTION..."
          sublabel="Applying transaction adjustment and signing manager approval..."
        />
      )}
    </div>
  );
}
