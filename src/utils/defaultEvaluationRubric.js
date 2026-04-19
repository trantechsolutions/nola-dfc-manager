// Default season evaluation rubric.
// Teams can override this via team_evaluation_rubrics; if no override exists,
// SeasonEvaluationView falls back to DEFAULT_EVAL_SECTIONS.

export const RATING_LABELS = {
  1: { label: 'Excellent', color: 'bg-emerald-500 text-white' },
  2: { label: 'Good', color: 'bg-blue-500 text-white' },
  3: { label: 'Needs Improvement', color: 'bg-amber-500 text-white' },
  4: { label: 'Below Expectations', color: 'bg-red-500 text-white' },
};

export const DEFAULT_EVAL_SECTIONS = [
  {
    key: 'technical',
    label: 'Technical',
    groups: [
      {
        key: 'passing',
        label: 'Passing',
        skills: [
          { key: 'passing_pace', label: 'Proper Pace' },
          { key: 'passing_accuracy', label: 'Accuracy' },
          { key: 'passing_types', label: 'Ability to utilize different types of passes' },
          { key: 'passing_driven', label: 'Ability to hit a driven ball' },
          { key: 'passing_bothfeet', label: 'Can use both feet' },
        ],
      },
      {
        key: 'receiving',
        label: 'Receiving',
        skills: [
          { key: 'receiving_feet', label: 'Good 1st touch with feet, with & w/out pressure' },
          { key: 'receiving_body', label: 'Good 1st touch with body, with & w/out pressure' },
          { key: 'receiving_awaypressure', label: 'First touch is taken away from pressure' },
        ],
      },
      {
        key: 'dribbling',
        label: 'Dribbling',
        skills: [
          { key: 'dribble_comfortable', label: 'Comfortable on the ball' },
          { key: 'dribble_takeon', label: 'Can take players on' },
          { key: 'dribble_moves', label: 'Has moves that buy time and space' },
          { key: 'dribble_shield', label: 'Can hold a player off with the ball (shield)' },
          { key: 'dribble_bothfeet', label: 'Can use both feet' },
        ],
      },
      {
        key: 'finishing',
        label: 'Finishing',
        skills: [
          { key: 'finish_accuracy', label: 'Accuracy' },
          { key: 'finish_power', label: 'Power' },
          { key: 'finish_mentality', label: 'Mentality to finish' },
          { key: 'finish_opportunities', label: 'Finishes opportunities' },
          { key: 'finish_bothfeet', label: 'Can use both feet' },
        ],
      },
      {
        key: 'heading',
        label: 'Heading',
        skills: [
          { key: 'head_defensive', label: 'Defensive headers (high and far)' },
          { key: 'head_attacking', label: 'Attacking headers (low and accurate)' },
          { key: 'head_accuracy', label: 'Accuracy' },
        ],
      },
    ],
  },
  {
    key: 'tactical',
    label: 'Tactical',
    groups: [
      {
        key: 'attacking',
        label: 'Attacking Decisions',
        skills: [
          { key: 'atk_creativity', label: 'Creativity' },
          { key: 'atk_combination', label: 'Sees and executes combination play' },
          { key: 'atk_dynamic', label: 'Is dynamic with the ball' },
          { key: 'atk_supporting', label: 'Takes up supporting positions' },
          { key: 'atk_readgame', label: 'Has ability to read game' },
          { key: 'atk_movement', label: 'Has smart movement off the ball' },
          { key: 'atk_speedofplay', label: 'Speed of play' },
        ],
      },
      {
        key: 'defending',
        label: 'Defending Decisions',
        skills: [
          { key: 'def_chase', label: 'Immediate chase if you lose the ball' },
          { key: 'def_patience', label: 'Patience in 1v1 situations' },
          { key: 'def_cover', label: 'Provides good distance/angle for cover' },
          { key: 'def_balance', label: 'Provides balance away from ball' },
        ],
      },
    ],
  },
  {
    key: 'physical',
    label: 'Physical',
    groups: [
      {
        key: 'speed',
        label: 'Speed',
        skills: [
          { key: 'phys_techspeed', label: 'Technical speed (manipulate ball at speed & maintain control)' },
          { key: 'phys_actionspeed', label: 'Speed of Action (processing info & choosing response)' },
          { key: 'phys_mentalspeed', label: 'Mental Speed (awareness of all factors/options)' },
          { key: 'phys_purespeed', label: 'Pure Speed (overcoming distance in shortest time)' },
        ],
      },
    ],
  },
  {
    key: 'psychological',
    label: 'Psychological',
    groups: [
      {
        key: 'mental',
        label: 'Mental Approach',
        skills: [
          { key: 'psych_instructions', label: 'Is willing to take instructions' },
          { key: 'psych_courageous', label: 'Is courageous & takes chances' },
          { key: 'psych_passion', label: 'Shows a passion for the game' },
          { key: 'psych_recover', label: 'Can recover after a mistake' },
          { key: 'psych_workrate', label: 'Has exemplary work rate' },
          { key: 'psych_trynew', label: 'Is willing to try new things' },
        ],
      },
    ],
  },
];

export function countSkills(sections) {
  let total = 0;
  for (const s of sections || []) {
    for (const g of s.groups || []) {
      total += (g.skills || []).length;
    }
  }
  return total;
}

// Produce a stable key from a human label. Used when coaches add new items.
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
