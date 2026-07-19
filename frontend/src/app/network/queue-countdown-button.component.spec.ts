import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { QueueCountdownButtonComponent } from './queue-countdown-button.component';
import { QueueStatusService } from './queue-status.service';
import { RoomState } from './room-state';

@Component({ template: '' })
class EmptyRouteComponent {}

describe('QueueCountdownButtonComponent', () => {
  let fixture: ComponentFixture<QueueCountdownButtonComponent>;
  let router: Router;
  const floatingRoom = signal<RoomState | null>({
    id: 'room-1',
    name: 'Arena 1',
    type: 'public',
    adminUserId: null,
    rewardsEligible: true,
    status: 'countdown',
    playerCount: 6,
    minPlayers: 4,
    maxPlayers: 15,
    countdownSeconds: 12,
    expiresAt: null,
  });
  const startingPrivateRoom = signal(false);
  const startPrivateRoomFailed = signal(false);
  const user = signal<{ id: string } | null>({ id: 'admin-1' });
  const startPrivateRoom = vi.fn();

  beforeEach(async () => {
    floatingRoom.set({
      id: 'room-1',
      name: 'Arena 1',
      type: 'public',
      adminUserId: null,
      rewardsEligible: true,
      status: 'countdown',
      playerCount: 6,
      minPlayers: 4,
      maxPlayers: 15,
      countdownSeconds: 12,
      expiresAt: null,
    });
    startingPrivateRoom.set(false);
    startPrivateRoomFailed.set(false);
    user.set({ id: 'admin-1' });
    startPrivateRoom.mockReset();
    await TestBed.configureTestingModule({
      imports: [
        QueueCountdownButtonComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'queueFloating.countdown': 'Battle starts in',
              'queueFloating.countdownSeconds': '{{seconds}}s',
              'queueFloating.players': '{{current}}/{{max}} players',
              'queueFloating.privateRoom': 'PRIVATE ROOM',
              'queueFloating.waiting': 'Waiting for players',
              'queueFloating.viewRoom': 'View room',
              'queueFloating.startFailed': 'Could not start',
              'lobby.privateRooms.startMatch': 'Start match',
              'lobby.privateRooms.minimumPlayers': 'At least {{min}} players',
              'lobby.privateRooms.waitingForAdmin': 'Waiting for admin',
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
        {
          provide: QueueStatusService,
          useValue: { floatingRoom, startingPrivateRoom, startPrivateRoomFailed, startPrivateRoom },
        },
        { provide: AuthService, useValue: { user } },
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
    expect(button.textContent).toContain('Battle starts in');
    expect(button.textContent).toContain('12s');
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

  it('shows private-room stats and lets the room admin start away from the lobby', () => {
    floatingRoom.set({
      id: 'private-1',
      name: 'Squad Room',
      type: 'private',
      adminUserId: 'admin-1',
      rewardsEligible: false,
      status: 'waiting',
      playerCount: 3,
      minPlayers: 2,
      maxPlayers: 16,
      countdownSeconds: null,
      expiresAt: Date.now() + 240_000,
      players: [
        { userId: 'admin-1', username: 'Admin', connected: true },
        { userId: 'player-2', username: 'Player 2', connected: true },
        { userId: 'player-3', username: 'Player 3', connected: false },
      ],
    });
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.queue-card') as HTMLElement;
    const startButton = fixture.nativeElement.querySelector('.start-match') as HTMLButtonElement;
    expect(card.textContent).toContain('Squad Room');
    expect(card.textContent).toContain('2/16 players');
    expect(startButton.disabled).toBe(false);

    startButton.click();
    expect(startPrivateRoom).toHaveBeenCalledWith('admin-1');
  });
});
