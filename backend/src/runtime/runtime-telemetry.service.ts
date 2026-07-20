import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat } from 'fs/promises';
import { freemem, hostname } from 'os';
import { join } from 'path';
import { EventLoopUtilization, monitorEventLoopDelay, performance } from 'perf_hooks';
import { PrismaService } from '../prisma/prisma.service';
import { RuntimeActivityService } from './runtime-activity.service';
import {
  RUNTIME_TELEMETRY_RECENT_SAMPLE_LIMIT,
  RUNTIME_TELEMETRY_SAMPLE_INTERVAL_MS,
} from '../config/runtime.config';

export interface RuntimeContextMetrics {
  connectedSockets: number;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  tick: { targetMs: number; averageMs: number; delayedTicks: number };
}

export interface RuntimeMetricSample extends RuntimeContextMetrics {
  sampledAt: string;
  cpuPercent: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  availableMemoryMb: number;
  eventLoopUtilization: number;
  eventLoopDelayMs: number;
  connectedPlayers: number;
  uptimeSeconds: number;
}

type MinuteMetric = {
  instanceId: string;
  bucketAt: string;
  eligibleSamples: number;
  cpuPercentAverage: number;
  cpuPercentMaximum: number;
  rssMbAverage: number;
  rssMbMaximum: number;
  heapUsedMbAverage: number;
  heapUsedMbMaximum: number;
  availableMemoryMbAvg: number;
  eventLoopUtilAvg: number;
  eventLoopUtilMax: number;
  eventLoopDelayMsAvg: number;
  eventLoopDelayMsMax: number;
  tickMsAverage: number;
  tickMsMaximum: number;
  connectedPlayersMax: number;
  connectedSocketsMax: number;
  roomsMax: number;
  activeMatchesMax: number;
};

@Injectable()
export class RuntimeTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuntimeTelemetryService.name);
  private readonly instanceId: string;
  private readonly telemetryDir: string;
  private readonly currentFile: string;
  private readonly delayHistogram = monitorEventLoopDelay({ resolution: 20 });
  private readonly ring: RuntimeMetricSample[] = [];
  private contextProvider: () => RuntimeContextMetrics = () => ({
    connectedSockets: 0,
    waitingRooms: 0,
    playingRooms: 0,
    totalRooms: 0,
    tick: { targetMs: 0, averageMs: 0, delayedTicks: 0 },
  });
  private timer?: NodeJS.Timeout;
  private previousCpu = process.cpuUsage();
  private previousSampleAt = performance.now();
  private previousElu: EventLoopUtilization = performance.eventLoopUtilization();
  private currentBucketAt = this.minuteStart(Date.now());
  private currentSegmentAt = Date.now();
  private eligibleSamples: RuntimeMetricSample[] = [];
  private flushing?: Promise<number>;
  private sampleInFlight?: Promise<void>;

  constructor(
    config: ConfigService,
    private readonly activity: RuntimeActivityService,
    private readonly prisma: PrismaService,
  ) {
    this.instanceId = config.get<string>('TELEMETRY_INSTANCE_ID', hostname());
    this.telemetryDir = config.get<string>('TELEMETRY_DIR')
      || (config.get<string>('NODE_ENV') === 'production' ? '/app/data/telemetry' : './data/telemetry');
    this.currentFile = join(this.telemetryDir, 'current.ndjson');
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.telemetryDir, { recursive: true });
    this.delayHistogram.enable();
    this.timer = setInterval(() => {
      void this.sample().catch(error => {
        this.logger.error(`Could not sample runtime telemetry: ${error instanceof Error ? error.message : error}`);
      });
    }, RUNTIME_TELEMETRY_SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.delayHistogram.disable();
  }

  setContextProvider(provider: () => RuntimeContextMetrics): void {
    this.contextProvider = provider;
  }

  latest(): RuntimeMetricSample | null {
    return this.ring.at(-1) ?? null;
  }

  recent(): RuntimeMetricSample[] {
    return [...this.ring];
  }

  async flushCompletedBatches(): Promise<number> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => { this.flushing = undefined; });
    return this.flushing;
  }

  /** Closes the active partial minute at match end, then flushes without waiting for the clock boundary. */
  async checkpointMatchMinuteAndFlush(): Promise<number> {
    await this.sample();
    await this.finishMinute();
    this.eligibleSamples = [];
    this.currentSegmentAt = Math.max(Date.now(), this.currentSegmentAt + 1);
    return this.flushCompletedBatches();
  }

  async history(from: Date, to: Date) {
    const rows = await this.prisma.nodeRuntimeMetricMinute.findMany({
      where: { bucketAt: { gte: from, lte: to } },
      orderBy: { bucketAt: 'asc' },
      take: 50_000,
    });
    const durationMs = Math.max(0, to.getTime() - from.getTime());
    const resolutionMs = durationMs <= 48 * 60 * 60 * 1000
      ? 60_000
      : durationMs <= 8 * 24 * 60 * 60 * 1000
        ? 5 * 60_000
        : 60 * 60_000;
    const groups = new Map<number, typeof rows>();
    for (const row of rows) {
      const bucket = Math.floor(row.bucketAt.getTime() / resolutionMs) * resolutionMs;
      const group = groups.get(bucket) ?? [];
      group.push(row);
      groups.set(bucket, group);
    }
    return [...groups.entries()].map(([bucket, group]) => this.aggregateHistoryGroup(bucket, group));
  }

  private sample(): Promise<void> {
    if (this.sampleInFlight) return this.sampleInFlight;
    this.sampleInFlight = this.collectSample().finally(() => {
      this.sampleInFlight = undefined;
    });
    return this.sampleInFlight;
  }

  private async collectSample(): Promise<void> {
    const now = Date.now();
    const bucketAt = this.minuteStart(now);
    if (bucketAt !== this.currentBucketAt) {
      await this.finishMinute();
      this.currentBucketAt = bucketAt;
      this.currentSegmentAt = bucketAt;
      this.eligibleSamples = [];
    }

    const wallMicros = Math.max(1, (performance.now() - this.previousSampleAt) * 1_000);
    const cpu = process.cpuUsage(this.previousCpu);
    const elu = performance.eventLoopUtilization(this.previousElu);
    const memory = process.memoryUsage();
    const context = this.contextProvider();
    const sample: RuntimeMetricSample = {
      sampledAt: new Date(now).toISOString(),
      cpuPercent: this.round(((cpu.user + cpu.system) / wallMicros) * 100),
      rssMb: this.toMb(memory.rss),
      heapUsedMb: this.toMb(memory.heapUsed),
      heapTotalMb: this.toMb(memory.heapTotal),
      availableMemoryMb: this.toMb(this.availableMemory()),
      eventLoopUtilization: this.round(elu.utilization * 100),
      eventLoopDelayMs: this.round(Number.isFinite(this.delayHistogram.mean) ? this.delayHistogram.mean / 1e6 : 0),
      connectedPlayers: this.activity.connectedPlayerCount(),
      uptimeSeconds: Math.floor(process.uptime()),
      ...context,
    };
    this.previousCpu = process.cpuUsage();
    this.previousSampleAt = performance.now();
    this.previousElu = performance.eventLoopUtilization();
    this.delayHistogram.reset();
    this.ring.push(sample);
    if (this.ring.length > RUNTIME_TELEMETRY_RECENT_SAMPLE_LIMIT) this.ring.shift();
    if (this.activity.hasCurrentMultiplayerActivity()) {
      this.eligibleSamples.push(sample);
    }
  }

  private async finishMinute(): Promise<void> {
    if (this.eligibleSamples.length === 0) return;
    const metric = this.aggregate(this.currentSegmentAt, this.eligibleSamples);
    await appendFile(this.currentFile, `${JSON.stringify(metric)}\n`, 'utf8');
  }

  private async doFlush(): Promise<number> {
    await mkdir(this.telemetryDir, { recursive: true });
    const batchFile = join(this.telemetryDir, `batch-${randomUUID()}.ndjson`);
    try {
      if ((await stat(this.currentFile)).size > 0) await rename(this.currentFile, batchFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const files = (await readdir(this.telemetryDir))
      .filter(file => file.startsWith('batch-') && file.endsWith('.ndjson'));
    let inserted = 0;
    for (const file of files) {
      const path = join(this.telemetryDir, file);
      const rows = (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as MinuteMetric);
      if (rows.length > 0) {
        const result = await this.prisma.nodeRuntimeMetricMinute.createMany({
          data: rows.map(row => ({ ...row, bucketAt: new Date(row.bucketAt) })),
          skipDuplicates: true,
        });
        inserted += result.count;
      }
      await rm(path);
    }
    return inserted;
  }

  private aggregate(bucketAt: number, samples: RuntimeMetricSample[]): MinuteMetric {
    const avg = (pick: (sample: RuntimeMetricSample) => number) => this.round(samples.reduce((sum, sample) => sum + pick(sample), 0) / samples.length);
    const max = (pick: (sample: RuntimeMetricSample) => number) => this.round(Math.max(...samples.map(pick)));
    return {
      instanceId: this.instanceId,
      bucketAt: new Date(bucketAt).toISOString(),
      eligibleSamples: samples.length,
      cpuPercentAverage: avg(s => s.cpuPercent), cpuPercentMaximum: max(s => s.cpuPercent),
      rssMbAverage: avg(s => s.rssMb), rssMbMaximum: max(s => s.rssMb),
      heapUsedMbAverage: avg(s => s.heapUsedMb), heapUsedMbMaximum: max(s => s.heapUsedMb),
      availableMemoryMbAvg: avg(s => s.availableMemoryMb),
      eventLoopUtilAvg: avg(s => s.eventLoopUtilization), eventLoopUtilMax: max(s => s.eventLoopUtilization),
      eventLoopDelayMsAvg: avg(s => s.eventLoopDelayMs), eventLoopDelayMsMax: max(s => s.eventLoopDelayMs),
      tickMsAverage: avg(s => s.tick.averageMs), tickMsMaximum: max(s => s.tick.averageMs),
      connectedPlayersMax: max(s => s.connectedPlayers), connectedSocketsMax: max(s => s.connectedSockets),
      roomsMax: max(s => s.totalRooms), activeMatchesMax: max(s => s.playingRooms),
    };
  }

  private aggregateHistoryGroup(
    bucketAt: number,
    rows: Awaited<ReturnType<PrismaService['nodeRuntimeMetricMinute']['findMany']>>,
  ) {
    const samples = rows.reduce((sum, row) => sum + row.eligibleSamples, 0);
    const weighted = (pick: (row: typeof rows[number]) => number) => this.round(
      rows.reduce((sum, row) => sum + pick(row) * row.eligibleSamples, 0) / Math.max(1, samples),
    );
    const max = (pick: (row: typeof rows[number]) => number) => this.round(Math.max(...rows.map(pick)));
    const instances = [...new Set(rows.map(row => row.instanceId))];
    return {
      id: rows[0].id,
      instanceId: instances.length === 1 ? instances[0] : `${instances.length} instances`,
      bucketAt: new Date(bucketAt),
      eligibleSamples: samples,
      cpuPercentAverage: weighted(row => row.cpuPercentAverage),
      cpuPercentMaximum: max(row => row.cpuPercentMaximum),
      rssMbAverage: weighted(row => row.rssMbAverage),
      rssMbMaximum: max(row => row.rssMbMaximum),
      heapUsedMbAverage: weighted(row => row.heapUsedMbAverage),
      heapUsedMbMaximum: max(row => row.heapUsedMbMaximum),
      availableMemoryMbAvg: weighted(row => row.availableMemoryMbAvg),
      eventLoopUtilAvg: weighted(row => row.eventLoopUtilAvg),
      eventLoopUtilMax: max(row => row.eventLoopUtilMax),
      eventLoopDelayMsAvg: weighted(row => row.eventLoopDelayMsAvg),
      eventLoopDelayMsMax: max(row => row.eventLoopDelayMsMax),
      tickMsAverage: weighted(row => row.tickMsAverage),
      tickMsMaximum: max(row => row.tickMsMaximum),
      connectedPlayersMax: max(row => row.connectedPlayersMax),
      connectedSocketsMax: max(row => row.connectedSocketsMax),
      roomsMax: max(row => row.roomsMax),
      activeMatchesMax: max(row => row.activeMatchesMax),
      createdAt: rows[0].createdAt,
    };
  }

  private minuteStart(now: number): number { return Math.floor(now / 60_000) * 60_000; }
  private availableMemory(): number {
    const runtimeProcess = process as NodeJS.Process & { availableMemory?: () => number };
    return runtimeProcess.availableMemory?.() ?? freemem();
  }
  private toMb(bytes: number): number { return this.round(bytes / 1024 / 1024); }
  private round(value: number): number { return Math.round(value * 100) / 100; }
}
