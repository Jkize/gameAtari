import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RuntimeActivityService } from './runtime-activity.service';
import { RuntimeTelemetryService } from './runtime-telemetry.service';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('RuntimeTelemetryService match checkpoint', () => {
  const createService = () => new RuntimeTelemetryService(
    { get: jest.fn((_key: string, fallback?: unknown) => fallback) } as unknown as ConfigService,
    { hasCurrentMultiplayerActivity: jest.fn(() => true) } as unknown as RuntimeActivityService,
    {} as PrismaService,
  );

  it('starts a new partial segment after every checkpoint', async () => {
    const service = createService();
    jest.spyOn(service as never, 'sample' as never).mockResolvedValue(undefined as never);
    const finish = jest.spyOn(service as never, 'finishMinute' as never).mockResolvedValue(undefined as never);
    const flush = jest.spyOn(service, 'flushCompletedBatches').mockResolvedValue(1);

    await expect(service.checkpointMatchMinuteAndFlush()).resolves.toBe(1);
    await expect(service.checkpointMatchMinuteAndFlush()).resolves.toBe(1);

    expect(finish).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('persists a short active match without waiting for the next minute', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tank-telemetry-'));
    const activity = new RuntimeActivityService();
    activity.playerConnected('player-1');
    activity.playerConnected('player-2');
    const createMany = jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'TELEMETRY_DIR') return directory;
        if (key === 'TELEMETRY_INSTANCE_ID') return 'test-instance';
        if (key === 'NODE_ENV') return 'test';
        return fallback;
      }),
    };
    const prisma = { nodeRuntimeMetricMinute: { createMany } };
    const service = new RuntimeTelemetryService(
      config as unknown as ConfigService,
      activity,
      prisma as unknown as PrismaService,
    );
    service.setContextProvider(() => ({
      connectedSockets: 2,
      waitingRooms: 0,
      playingRooms: 1,
      totalRooms: 1,
      tick: { targetMs: 16.67, averageMs: 17, delayedTicks: 0 },
    }));

    try {
      await service.checkpointMatchMinuteAndFlush();
      expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: [expect.objectContaining({
          activeMatchesMax: 1,
          connectedPlayersMax: 2,
          eligibleSamples: 1,
        })],
        skipDuplicates: true,
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('continues persisting samples in the same minute after another match checkpoints', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tank-telemetry-'));
    const activity = new RuntimeActivityService();
    activity.playerConnected('player-1');
    activity.playerConnected('player-2');
    const persisted: Array<{ bucketAt: Date; activeMatchesMax: number }> = [];
    const createMany = jest.fn(async ({ data }: { data: Array<{ bucketAt: Date; activeMatchesMax: number }> }) => {
      persisted.push(...data);
      return { count: data.length };
    });
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'TELEMETRY_DIR') return directory;
        if (key === 'TELEMETRY_INSTANCE_ID') return 'test-instance';
        if (key === 'NODE_ENV') return 'test';
        return fallback;
      }),
    };
    const prisma = { nodeRuntimeMetricMinute: { createMany } };
    const service = new RuntimeTelemetryService(
      config as unknown as ConfigService,
      activity,
      prisma as unknown as PrismaService,
    );
    let playingRooms = 2;
    service.setContextProvider(() => ({
      connectedSockets: 4,
      waitingRooms: 0,
      playingRooms,
      totalRooms: 2,
      tick: { targetMs: 16.67, averageMs: 17, delayedTicks: 0 },
    }));

    try {
      await service.checkpointMatchMinuteAndFlush();
      playingRooms = 1;
      await service.checkpointMatchMinuteAndFlush();

      expect(persisted).toHaveLength(2);
      expect(persisted[0].bucketAt.getTime()).not.toBe(persisted[1].bucketAt.getTime());
      expect(persisted.map(row => row.activeMatchesMax)).toEqual([2, 1]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps eligible samples when the local spool cannot be written', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tank-telemetry-'));
    const blockedPath = join(directory, 'not-a-directory');
    await writeFile(blockedPath, 'blocked', 'utf8');
    const activity = new RuntimeActivityService();
    activity.playerConnected('player-1');
    activity.playerConnected('player-2');
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'TELEMETRY_DIR') return blockedPath;
        if (key === 'TELEMETRY_INSTANCE_ID') return 'test-instance';
        return fallback;
      }),
    };
    const service = new RuntimeTelemetryService(
      config as unknown as ConfigService,
      activity,
      {} as PrismaService,
    );

    try {
      await expect(service.checkpointMatchMinuteAndFlush()).rejects.toBeDefined();
      expect((service as unknown as { eligibleSamples: unknown[] }).eligibleSamples).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
