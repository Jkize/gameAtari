import { DangerZoneRuntimeState, DangerZoneService } from './danger-zone.service';

describe('DangerZoneService', () => {
  let service: DangerZoneService;

  beforeEach(() => {
    service = new DangerZoneService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('picks a random center within the configured edge margin', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1);

    const center = service.pickCenter({ width: 2400, height: 1800 }, 300);

    expect(center.x).toBe(300);
    expect(center.y).toBe(1500);
  });

  it('uses the axis midpoint when a map is smaller than twice the margin', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.75);

    const center = service.pickCenter({ width: 500, height: 800 }, 300);

    expect(center.x).toBe(250);
    expect(center.y).toBe(450);
  });

  it('selects configs by player tier', () => {
    expect(service.configForPlayerCount(1).damagePerSecond).toBe(4);
    expect(service.configForPlayerCount(4).finalRadius).toBe(220);
    expect(service.configForPlayerCount(5).damagePerSecond).toBe(5);
    expect(service.configForPlayerCount(8).finalRadius).toBe(250);
    expect(service.configForPlayerCount(9).damagePerSecond).toBe(6);
    expect(service.configForPlayerCount(16).finalRadius).toBe(300);
  });

  it('starts with a radius that covers the whole map from the chosen center', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1);

    const zone = service.createRuntimeState({
      width: 2400,
      height: 1800,
      spawnPoints: [{ x: 100, y: 100 }],
      obstacles: [],
      powerUps: [],
    }, 4, 0);

    expect(zone.centerX).toBe(300);
    expect(zone.centerY).toBe(1500);
    expect(zone.initialRadius).toBeGreaterThan(Math.hypot(2400 - zone.centerX, zone.centerY));
    expect(service.isOutside(zone, 2400, 0, 0)).toBe(false);
    expect(service.isOutside(zone, 0, 1800, 0)).toBe(false);
  });

  it('moves through inactive, warning, active, and final phases at the configured times', () => {
    const zone = createZone();

    expect(service.phaseAt(zone, 89_999)).toBe('inactive');
    expect(service.phaseAt(zone, 90_000)).toBe('warning');
    expect(service.phaseAt(zone, 120_000)).toBe('active');
    expect(service.phaseAt(zone, 240_000)).toBe('final');
  });

  it('interpolates radius from initial to final during the shrink window', () => {
    const zone = createZone();

    expect(service.radiusAt(zone, 119_999)).toBe(900);
    expect(service.radiusAt(zone, 180_000)).toBe(560);
    expect(service.radiusAt(zone, 240_000)).toBe(220);
    expect(service.radiusAt(zone, 300_000)).toBe(220);
  });

  it('detects whether a point is outside the current safe zone', () => {
    const zone = createZone();

    expect(service.isOutside(zone, 500, 500, 120_000)).toBe(false);
    expect(service.isOutside(zone, 1500, 500, 120_000)).toBe(true);
  });

  it('builds the public state without map data', () => {
    const zone = createZone();

    expect(service.buildPublicState(zone, 120_000)).toMatchObject({
      phase: 'active',
      centerX: 500,
      centerY: 500,
      radius: 900,
      damagePerSecond: 4,
      warningMessage: 'LA ZONA SE ESTA CERRANDO',
      nextShrinkAtMs: 155_000,
    });
  });

  function createZone(): DangerZoneRuntimeState {
    return {
      ...service.configForPlayerCount(4),
      enabled: true,
      edgeMarginPx: 300,
      centerX: 500,
      centerY: 500,
      startedAtMs: 0,
      warningMessage: 'LA ZONA SE ESTA CERRANDO',
      damageCarryByPlayerId: {},
      initialRadius: 900,
    };
  }
});
