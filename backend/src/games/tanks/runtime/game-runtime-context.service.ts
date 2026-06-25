import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { GameRuntimeState } from './game-runtime.types';

@Injectable()
export class GameRuntimeContext {
  private readonly storage = new AsyncLocalStorage<GameRuntimeState>();

  run<T>(state: GameRuntimeState, callback: () => T): T {
    return this.storage.run(state, callback);
  }

  current(): GameRuntimeState {
    const state = this.storage.getStore();
    if (!state) throw new Error('Game runtime context is not active');
    return state;
  }
}
