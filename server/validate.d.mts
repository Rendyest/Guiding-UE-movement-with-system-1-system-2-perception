export interface CoachValidation {
  ok: boolean;
  error?: string;
}

export function validateCoachSummary(body: unknown): CoachValidation;
