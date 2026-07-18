import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { GameRuntimeContext } from '../runtime/game-runtime-context.service';
import type { Player } from '../types/player.types';
import {
  DamageSource,
  EliminationAttribution,
  PlayerEliminatedEvent,
} from './elimination-event.types';
import { KILL_ATTRIBUTION_WINDOW_MS } from '../config/elimination.config';

@Injectable()
export class EliminationService {
  constructor(private readonly runtime: GameRuntimeContext) {}

  recordExternalDamage(victimId: string, source: DamageSource, now: number): void {
    if (!source.attackerId || source.attackerId === victimId) return;
    const attacker = this.runtime.current().players.get(source.attackerId);
    this.runtime.current().recentExternalDamage.set(victimId, {
      attackerId: source.attackerId,
      attackerName: this.optionalDisplayName(source.attackerName ?? attacker?.username),
      damagedAt: now,
    });
  }

  recordElimination(victim: Player, source: DamageSource, now: number): PlayerEliminatedEvent {
    const lethalSourcePlayerId = source.attackerId ?? null;
    const directKillerId = source.attackerId && source.attackerId !== victim.id
      ? source.attackerId
      : null;
    const recent = this.runtime.current().recentExternalDamage.get(victim.id);
    const recentKillerId = recent && now - recent.damagedAt <= KILL_ATTRIBUTION_WINDOW_MS
      ? recent.attackerId
      : null;
    const creditedKillerId = directKillerId ?? recentKillerId;
    const attribution = this.resolveAttribution(source, victim.id, directKillerId, recentKillerId);
    const creditedKiller = creditedKillerId
      ? this.runtime.current().players.get(creditedKillerId)
      : undefined;
    const creditedKillerName = directKillerId
      ? this.optionalDisplayName(source.attackerName ?? creditedKiller?.username)
      : this.optionalDisplayName(recent?.attackerName ?? creditedKiller?.username);

    const event: PlayerEliminatedEvent = {
      id: randomUUID(),
      victimId: victim.id,
      victimName: this.displayName(victim.username, victim.id),
      creditedKillerId,
      creditedKillerName: creditedKillerId
        ? this.displayName(creditedKillerName, creditedKillerId)
        : null,
      lethalSourcePlayerId,
      cause: source.cause,
      weapon: source.weapon,
      attribution,
      selfInflicted: source.attackerId === victim.id,
      occurredAt: now,
    };

    this.runtime.current().recentExternalDamage.delete(victim.id);
    this.runtime.current().eliminationEvents.push(event);
    return event;
  }

  private resolveAttribution(
    source: DamageSource,
    victimId: string,
    directKillerId: string | null,
    recentKillerId: string | null,
  ): EliminationAttribution {
    if (directKillerId) return 'direct';
    if (recentKillerId) return 'recent_damage';
    if (source.attackerId === victimId) return 'self';
    return 'environment';
  }

  private displayName(username: string | undefined, userId: string): string {
    return this.optionalDisplayName(username) ?? userId;
  }

  private optionalDisplayName(username: string | undefined): string | undefined {
    const normalized = username?.trim();
    return normalized ? normalized : undefined;
  }
}
