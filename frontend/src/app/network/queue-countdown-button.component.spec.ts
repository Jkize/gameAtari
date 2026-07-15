import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { QueueCountdownButtonComponent } from './queue-countdown-button.component';
import { QueueStatusService } from './queue-status.service';
import { RoomState } from './room-state';

@Component({ template: '' })
class EmptyRouteComponent {}

describe('QueueCountdownButtonComponent', () => {
  let fixture: ComponentFixture<QueueCountdownButtonComponent>;
  let router: Router;
  const countdownRoom = signal<RoomState | null>({
    id: 'room-1',
    name: 'Arena 1',
    status: 'countdown',
    playerCount: 6,
    minPlayers: 4,
    maxPlayers: 15,
    countdownSeconds: 12,
  });

  beforeEach(async () => {
    countdownRoom.set({
      id: 'room-1',
      name: 'Arena 1',
      status: 'countdown',
      playerCount: 6,
      minPlayers: 4,
      maxPlayers: 15,
      countdownSeconds: 12,
    });
    await TestBed.configureTestingModule({
      imports: [
        QueueCountdownButtonComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'queueFloating.countdown': 'Battle starts in {{seconds}}s',
              'queueFloating.players': '{{current}}/{{max}} players',
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([
          { path: 'lobby', component: EmptyRouteComponent },
          { path: 'matches/me', component: EmptyRouteComponent },
        ]),
        { provide: QueueStatusService, useValue: { countdownRoom } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    await router.navigateByUrl('/matches/me');
    fixture = TestBed.createComponent(QueueCountdownButtonComponent);
    fixture.detectChanges();
  });

  it('shows the countdown and player count away from the lobby', () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Battle starts in 12s');
    expect(button.textContent).toContain('6/15 players');
  });

  it('returns to the lobby when clicked and then hides', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/lobby');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
