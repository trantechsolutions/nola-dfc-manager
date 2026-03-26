import React, { useState } from 'react';
import { ClipboardCheck, ArrowLeft } from 'lucide-react';
import { useT } from '../../../i18n/I18nContext';
import EvaluationSessionList from './EvaluationSessionList';
import EvaluationSessionDetail from './EvaluationSessionDetail';

export default function EvaluationHub({ club, teams, seasons, selectedSeason, showToast, showConfirm, user }) {
  const { t } = useT();
  const [activeSessionId, setActiveSessionId] = useState(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {activeSessionId && (
          <button
            onClick={() => setActiveSessionId(null)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <ClipboardCheck size={22} className="text-indigo-500 dark:text-indigo-400" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('evaluations.title', 'Player Evaluations')}
          </h2>
        </div>
      </div>

      {/* Content */}
      {activeSessionId === null ? (
        <EvaluationSessionList
          club={club}
          seasons={seasons}
          selectedSeason={selectedSeason}
          user={user}
          onSelectSession={(id) => setActiveSessionId(id)}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      ) : (
        <EvaluationSessionDetail
          club={club}
          teams={teams}
          seasons={seasons}
          selectedSeason={selectedSeason}
          sessionId={activeSessionId}
          user={user}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
    </div>
  );
}
