export const importableNazemPlans = (candidate) => (candidate.plans || []).filter((plan) => (
  ['discovered', 'requires_review'].includes(plan.status)
));

export const needsNazemStudentImport = (candidate) => (
  !candidate.linkedStudentId || importableNazemPlans(candidate).length > 0
);

/** Keep legacy callers strict, while allowing an explicit student-only selection. */
export const selectedNazemPlanCandidateIds = (mode, selections) => selections
  .filter((selection) => mode === 'with_plans' || selection.importPlan)
  .map((selection) => selection.candidateId);
