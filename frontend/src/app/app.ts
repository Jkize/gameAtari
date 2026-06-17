import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, HostBinding } from '@angular/core';
import { TankGame } from './game/TankGame';
import { ACTIVE_BACKGROUND_SCENARIO } from './scenarios/background-scenarios';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  protected readonly scenarioClass = ACTIVE_BACKGROUND_SCENARIO.cssClass;

  @HostBinding('class')
  protected readonly hostClass = this.scenarioClass;

  @ViewChild('gameContainer', { static: true })
  private containerRef!: ElementRef<HTMLDivElement>;

  private game!: TankGame;

  ngAfterViewInit(): void {
    this.game = new TankGame(this.containerRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.game?.destroy(true);
  }
}
