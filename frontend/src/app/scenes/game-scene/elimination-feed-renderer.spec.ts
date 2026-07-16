import { buildEliminationMessage } from './elimination-message';
import type { PlayerEliminatedEvent } from './match-notification.types';

describe('buildEliminationMessage', () => {
  const translate = (key: string, params: Record<string, unknown> = {}) =>
    `${key}:${JSON.stringify(params)}`;
  const base: PlayerEliminatedEvent = {
    id: 'event-1',
    victimId: 'victim',
    victimName: 'Victim',
    creditedKillerId: 'killer',
    creditedKillerName: 'Killer',
    lethalSourcePlayerId: 'killer',
    cause: 'projectile',
    weapon: 'standard',
    attribution: 'direct',
    selfInflicted: false,
    occurredAt: 1,
  };

  it('uses the direct elimination translation with both player names', () => {
    expect(buildEliminationMessage(base, translate)).toContain(
      'hud.elimination.direct:{"killer":"Killer","victim":"Victim"}',
    );
  });

  it('keeps recent-damage attribution while describing a reflected lethal source', () => {
    const message = buildEliminationMessage({
      ...base,
      attribution: 'recent_damage',
      cause: 'reflected_projectile',
      lethalSourcePlayerId: 'victim',
      selfInflicted: true,
    }, translate);

    expect(message).toContain('hud.elimination.recentDamage');
    expect(message).toContain('hud.elimination.reflected');
  });
});
