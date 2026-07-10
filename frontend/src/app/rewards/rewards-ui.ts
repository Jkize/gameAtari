import { RewardIneligibilityReason, RewardStatus } from './rewards.models';

export function rewardStatusLabel(status?: RewardStatus | null): string {
  switch (status) {
    case 'NOT_ELIGIBLE': return 'No elegible';
    case 'DAILY_LIMIT_REACHED': return 'Limite diario alcanzado';
    case 'PENDING': return 'Premio pendiente';
    case 'PROCESSING': return 'Procesando';
    case 'SUBMITTED': return 'Enviado a Solana';
    case 'SENT': return 'Confirmado';
    case 'FAILED': return 'Pago fallido';
    case 'MANUAL_REVIEW': return 'En revision';
    case 'CANCELLED': return 'Cancelado';
    default: return 'Sin premio';
  }
}

export function rewardStatusClass(status?: RewardStatus | null): string {
  switch (status) {
    case 'SENT': return 'ok';
    case 'PENDING':
    case 'PROCESSING':
    case 'SUBMITTED': return 'pending';
    case 'FAILED':
    case 'MANUAL_REVIEW': return 'warn';
    case 'NOT_ELIGIBLE':
    case 'DAILY_LIMIT_REACHED':
    case 'CANCELLED': return 'muted';
    default: return 'muted';
  }
}

export function ineligibilityReasonLabel(reason?: RewardIneligibilityReason | null): string {
  switch (reason) {
    case 'USER_NOT_AUTHENTICATED': return 'Debes iniciar sesion.';
    case 'WALLET_NOT_LINKED': return 'Wallet Phantom no vinculada.';
    case 'WALLET_NOT_VERIFIED': return 'Wallet no verificada.';
    case 'INSUFFICIENT_TOKEN_BALANCE': return 'No mantenias 10.000 tokens.';
    case 'DAILY_LIMIT_REACHED': return 'Limite diario alcanzado.';
    default: return '';
  }
}

export function publicRewardLabel(status?: RewardStatus | null): string {
  if (status === 'SENT') return 'Confirmado';
  if (status === 'PENDING' || status === 'PROCESSING' || status === 'SUBMITTED') return 'Pendiente';
  if (status === 'FAILED' || status === 'MANUAL_REVIEW') return 'En revision';
  if (status === 'DAILY_LIMIT_REACHED') return 'No elegible';
  if (status === 'NOT_ELIGIBLE') return 'No elegible';
  return 'Sin premio';
}
