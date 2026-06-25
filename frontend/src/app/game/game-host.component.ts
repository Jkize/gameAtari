import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { TankGame } from './TankGame';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';
import { socketManager } from '../network/socket';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-game-host',
  standalone: true,
  template: `
    <div class="game-wrapper" [class]="scenarioClass">
      <div #gameContainer id="game-container"></div>
    </div>
  `,
  styles: [`
    :host {
      --page-bg: #20170d;
      display: flex;
      width: 100vw;
      height: 100vh;
      padding: 5vh 5vw;
      align-items: center;
      justify-content: center;
      background: var(--page-bg);
      overflow: hidden;
    }

    .game-wrapper,
    #game-container {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    }
  `],
})
export class GameHostComponent implements AfterViewInit, OnDestroy {
  protected readonly scenarioClass = ACTIVE_BACKGROUND_SCENARIO.cssClass;

  @ViewChild('gameContainer', { static: true })
  private containerRef!: ElementRef<HTMLDivElement>;

  private game?: TankGame;

  private readonly returnToLobby = () => {
    void this.router.navigateByUrl('/lobby');
  };

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngAfterViewInit(): void {
    window.addEventListener('tank-arena:return-lobby', this.returnToLobby);
    socketManager.connect(this.auth.accessToken() ?? undefined);
    this.game = new TankGame(this.containerRef.nativeElement);
  }

  ngOnDestroy(): void {
    window.removeEventListener('tank-arena:return-lobby', this.returnToLobby);
    this.game?.destroy(true);
  }
}
