import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Edit2, Trash2, Check, X, BarChart3, Calendar, TrendingUp } from 'lucide-react';
import { BusinessWithLatestAnalysis } from '../lib/database';

interface BusinessCardProps {
  business: BusinessWithLatestAnalysis;
  onUpdateName: (businessId: string, newName: string) => Promise<void>;
  onDelete: (businessId: string) => void;
}

export function BusinessCard({ business, onUpdateName, onDelete }: BusinessCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(business.business_name);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveName = async () => {
    if (editedName.trim() && editedName !== business.business_name) {
      setIsSaving(true);
      try {
        await onUpdateName(business.id, editedName.trim());
        setIsEditing(false);
      } catch (error) {
        console.error('Failed to update business name:', error);
        setEditedName(business.business_name);
      } finally {
        setIsSaving(false);
      }
    } else {
      setEditedName(business.business_name);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedName(business.business_name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-5 h-5 ${
              star <= Math.round(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-slate-300'
            }`}
          />
        ))}
        <span className="ml-2 text-lg font-bold text-slate-900">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-blue-100 overflow-hidden hover:shadow-xl transition-all">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveName}
                disabled={isSaving}
                autoFocus
                className="flex-1 text-xl font-bold px-3 py-1 border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveName}
                disabled={isSaving}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900 truncate">
                {business.business_name}
              </h3>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => onDelete(business.id)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {business.latest_analysis ? (
          <>
            <div className="mb-4">
              {renderStars(business.latest_analysis.average_rating)}
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
              <Calendar className="w-4 h-4" />
              <span>Last analyzed: {formatDate(business.latest_analysis.created_at)}</span>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                to={`/report/${business.latest_analysis.id}`}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
              >
                <BarChart3 className="w-4 h-4" />
                View Report
              </Link>
              <div className="flex gap-3">
                {business.analysis_count && business.analysis_count >= 2 && (
                  <Link
                    to={`/delta/${business.latest_analysis.id}`}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                    title="View 3-Lens Comparison"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Compare
                  </Link>
                )}
                <Link
                  to={`/?businessId=${business.id}`}
                  className={`${business.analysis_count && business.analysis_count >= 2 ? 'flex-1' : ''} flex items-center justify-center px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold rounded-lg transition-colors`}
                >
                  New Analysis
                </Link>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500 mb-4">No analyses yet</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <BarChart3 className="w-4 h-4" />
              Start First Analysis
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
