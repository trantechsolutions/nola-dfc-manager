import { Check, Circle } from 'lucide-react';

/**
 * OnboardingChecklist — shows when a team needs setup.
 * Guides new managers through: create season → set budget → add players → enroll.
 */
export default function OnboardingChecklist({ hasPlayers, hasSeason, hasBudget, hasPlayersEnrolled, navigate }) {
  const steps = [
    {
      label: 'Create a season',
      done: hasSeason,
      action: () => navigate('/finance/budget'),
      hint: 'Set up a season to track budgets and fees.',
    },
    {
      label: 'Set up your budget',
      done: hasBudget,
      action: () => navigate('/finance/budget'),
      hint: 'Add line items for tournaments, league fees, and expenses.',
    },
    {
      label: 'Add players to the roster',
      done: hasPlayers,
      action: () => navigate('/people'),
      hint: 'Import players via CSV or add them one by one.',
    },
    {
      label: 'Enroll players in the season',
      done: hasPlayersEnrolled,
      action: () => navigate('/finance/budget'),
      hint: 'Assign players to the season roster in the Budget tab.',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  if (completedCount === steps.length) return null; // All done — don't show

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-black text-blue-800 dark:text-blue-300">Getting Started</h3>
        <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
          Complete these steps to set up your team. {completedCount}/{steps.length} done.
        </p>
      </div>

      <div className="w-full h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <button
            key={i}
            onClick={step.action}
            disabled={step.done}
            className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all ${
              step.done
                ? 'bg-white/50 dark:bg-slate-800/50'
                : 'bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-blue-100 dark:border-blue-800'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                step.done
                  ? 'bg-emerald-500 text-white'
                  : 'bg-blue-200 dark:bg-blue-800 text-blue-500 dark:text-blue-400'
              }`}
            >
              {step.done ? <Check size={12} /> : <Circle size={12} />}
            </div>
            <div>
              <p
                className={`text-sm font-bold ${step.done ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-white'}`}
              >
                {step.label}
              </p>
              {!step.done && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{step.hint}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
