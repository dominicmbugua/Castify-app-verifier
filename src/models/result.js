export const Status = {
  VERIFIED: 'Verified',
  MISMATCH: 'Mismatch',
  BROKEN: 'Broken',
  REVIEW: 'Needs Review',
};

export function createResult(fields = {}) {
  return {
    url: '',
    platform: 'unknown',
    appId: null,
    status: Status.REVIEW,
    appName: null,
    developer: null,
    version: null,
    notes: '',
    durationMs: null,
    checkedAt: new Date().toISOString(),
    ...fields,
  };
}