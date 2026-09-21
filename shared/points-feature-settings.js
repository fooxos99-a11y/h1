export const enforcePointsFeatureDependencies = (settings = {}) => {
  const next = { ...settings };

  if (!next.pointsSystemEnabled) {
    next.rankingsVisible = false;
    next.studentRankingsVisible = false;
    next.familyRankingsVisible = false;
    next.rankingPointsVisible = false;
    next.storeEnabled = false;
    next.storePurchaseDeductsRanking = false;
    next.teacherManualPointsEnabled = false;
    next.dailyChallengeEnabled = false;
    next.summitEnabled = false;
    return next;
  }

  next.rankingsVisible = Boolean(next.studentRankingsVisible || next.familyRankingsVisible);
  if (!next.rankingsVisible) next.rankingPointsVisible = false;
  if (!next.storeEnabled) next.storePurchaseDeductsRanking = false;
  return next;
};
