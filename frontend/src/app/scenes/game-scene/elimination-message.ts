import { t } from '../../shared/translate-bridge';
import type { PlayerEliminatedEvent } from './match-notification.types';

type Translate = (key: string, params?: Record<string, unknown>) => string;

export function buildEliminationMessage(
  event: PlayerEliminatedEvent,
  translate: Translate = t,
): string {
  const reflected = event.cause === 'reflected_projectile'
    ? translate('hud.elimination.reflected')
    : '';
  if (event.attribution === 'self') {
    return `${translate('hud.elimination.self', { victim: event.victimName })}${reflected}`;
  }
  if (event.attribution === 'environment') {
    return translate('hud.elimination.environment', { victim: event.victimName });
  }
  const key = event.attribution === 'recent_damage'
    ? 'hud.elimination.recentDamage'
    : 'hud.elimination.direct';
  return `${translate(key, {
    killer: event.creditedKillerName ?? '',
    victim: event.victimName,
  })}${reflected}`;
}
