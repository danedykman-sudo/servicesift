import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { BusinessCard } from '../components/BusinessCard';
import {
  getUserBusinesses,
  updateBusinessName,
  deleteBusiness,
  BusinessWithLatestAnalysis,
  cleanupDuplicateBusinesses,
} from '../lib/database';

export function Dashboard() {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessWithLatestAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [businessToDelete, setBusinessToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');

  useEffect(() => {
    loadBusinesses();
  }, []);

  const loadBusinesses = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getUserBusinesses();
      setBusinesses(data);
    } catch (err: any) {
      console.error('Failed to load businesses:', err);
      setError(err.message || 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (businessId: string, newName: string) => {
    try {
      await updateBusinessName(businessId, newName);
      setBusinesses((prev) =>
        prev.map((b) => (b.id === businessId ? { ...b, business_name: newName } : b))
      );
    } catch (err: any) {
      console.error('Failed to update business name:', err);
      throw err;
    }
  };

  const handleDeleteClick = (businessId: string) => {
    setBusinessToDelete(businessId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!businessToDelete) return;

    try {
      setDeleting(true);
      await deleteBusiness(businessToDelete);
      setBusinesses((prev) => prev.filter((b) => b.id !== businessToDelete));
      setShowDeleteModal(false);
      setBusinessToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete business:', err);
      alert('Failed to delete business. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    try {
      setCleaningUp(true);
      setCleanupMessage('');
      const result = await cleanupDuplicateBusinesses();

      if (result.cleaned > 0) {
        setCleanupMessage(`Cleaned up ${result.cleaned} duplicate business${result.cleaned !== 1 ? 'es' : ''}. Kept ${result.kept} unique business${result.kept !== 1 ? 'es' : ''}.`);
        await loadBusinesses();
      } else {
        setCleanupMessage('No duplicates found. Your businesses are already clean!');
      }

      setTimeout(() => setCleanupMessage(''), 5000);
    } catch (err: any) {
      console.error('Failed to cleanup duplicates:', err);
      setCleanupMessage('Failed to cleanup duplicates. Please try again.');
      setTimeout(() => setCleanupMessage(''), 5000);
    } finally {
      setCleaningUp(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading your businesses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 mb-2">Your Businesses</h1>
            <p className="text-lg text-slate-600">
              Manage and track your business analysis reports
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCleanupDuplicates}
              disabled={cleaningUp}
              className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-lg transition-all shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Merge duplicate businesses"
            >
              {cleaningUp ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
              {cleaningUp ? 'Cleaning...' : 'Clean Duplicates'}
            </button>
            <Link
              to="/"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-5 h-5" />
              New Analysis
            </Link>
          </div>
        </div>

        {cleanupMessage && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-green-700 font-semibold">{cleanupMessage}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {businesses.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-12 text-center">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Get Started with ServiceSift
            </h2>
            <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
              Analyze your first business to unlock powerful insights from customer reviews. Discover
              root causes, get coaching scripts, and build a 30-day action plan.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-lg rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-6 h-6" />
              Analyze Your First Business
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses.map((business) => (
              <BusinessCard
                key={business.id}
                business={business}
                onUpdateName={handleUpdateName}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Delete Business?</h2>
            <p className="text-slate-600 mb-6 text-center">
              This will permanently delete this business and all associated analyses. This action cannot
              be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setBusinessToDelete(null);
                }}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
