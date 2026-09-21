/* global addEventListener, CapacitorKV */
addEventListener('madarijOfflineRecitationSync', (resolve) => {
  CapacitorKV.set('madarij_offline_recitation_wakeup', new Date().toISOString());
  resolve({ requested: true });
});

addEventListener('consumeMadarijOfflineRecitationWakeup', (resolve) => {
  const stored = CapacitorKV.get('madarij_offline_recitation_wakeup');
  if (stored?.value) CapacitorKV.remove('madarij_offline_recitation_wakeup');
  resolve({ requested: Boolean(stored?.value), requestedAt: stored?.value || null });
});
