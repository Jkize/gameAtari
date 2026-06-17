import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { TankGame } from './game/TankGame';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
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
