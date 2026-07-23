import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartConfiguration, ChartData, ChartDataset } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Socket } from 'socket.io-client';
import { AuthService } from '@core/auth/auth.service';
import { socketManager } from '@core/realtime/socket';
import { SOCKET_EVENTS } from '@core/realtime/socket-events';
import { AdminStatsPreferencesService } from '../admin-stats-preferences.service';
import { AdminStatsService } from '../admin-stats.service';
import { HistoricalRuntimeMetric, RuntimeMetricSample } from '../admin-stats.types';

type StatsUpdate = { latest: RuntimeMetricSample | null; recent?: RuntimeMetricSample[] };
type StatsView = 'realtime' | 'history';
type StatsMessage = { key: string; params?: Record<string, number> };
type StatsSeries = { key: string; labelKey: string; data: number[]; color: string };
type PreferenceDataset = ChartDataset<'line'> & { preferenceKey?: string };

@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [BaseChartDirective, TranslocoPipe, DatePipe],
  templateUrl: './admin-stats.component.html',
  styleUrl: './admin-stats.component.css',
})
export class AdminStatsComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AdminStatsService);
  private readonly preferences = inject(AdminStatsPreferencesService);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private socket?: Socket;

  protected readonly samples = signal<RuntimeMetricSample[]>([]);
  protected readonly latest = computed(() => this.samples().at(-1) ?? null);
  protected readonly historical = signal<HistoricalRuntimeMetric[]>([]);
  protected readonly activeView = signal<StatsView>('realtime');
  protected readonly historyHours = signal(24);
  protected readonly historyLoading = signal(false);
  protected readonly message = signal<StatsMessage | null>(null);

  protected readonly chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0.2 } },
    scales: { x: { display: false }, y: { beginAtZero: true } },
    plugins: {
      legend: {
        position: 'bottom',
        onClick: (_event, item, legend) => {
          const datasetIndex = item.datasetIndex;
          if (datasetIndex == null) return;
          const visible = !legend.chart.isDatasetVisible(datasetIndex);
          const dataset = legend.chart.data.datasets[datasetIndex] as PreferenceDataset;
          this.preferences.setVisible(dataset.preferenceKey ?? item.text, visible);
          legend.chart.setDatasetVisibility(datasetIndex, visible);
          legend.chart.update();
        },
      },
    },
  };

  protected readonly cpuChart = computed(() => this.realtimeChart([
    this.series('realtime.cpu', 'adminStats.series.cpu', this.samples().map(s => s.cpuPercent), '#d85a30'),
    this.series('realtime.eventLoopUtil', 'adminStats.series.eventLoopUtil', this.samples().map(s => s.eventLoopUtilization), '#1d9e75'),
  ]));
  protected readonly memoryChart = computed(() => this.realtimeChart([
    this.series('realtime.rss', 'adminStats.series.rss', this.samples().map(s => s.rssMb), '#3927a0'),
    this.series('realtime.heap', 'adminStats.series.heap', this.samples().map(s => s.heapUsedMb), '#b0125b'),
    this.series('realtime.availableMemory', 'adminStats.series.availableMemory', this.samples().map(s => s.availableMemoryMb), '#0f6e56'),
  ]));
  protected readonly loopChart = computed(() => this.realtimeChart([
    this.series('realtime.eventLoopDelay', 'adminStats.series.eventLoopDelay', this.samples().map(s => s.eventLoopDelayMs), '#ba7517'),
    this.series('realtime.tick', 'adminStats.series.tick', this.samples().map(s => s.tick.averageMs), '#185fa5'),
  ]));
  protected readonly activityChart = computed(() => this.realtimeChart([
    this.series('realtime.players', 'adminStats.series.players', this.samples().map(s => s.connectedPlayers), '#007c68'),
    this.series('realtime.sockets', 'adminStats.series.sockets', this.samples().map(s => s.connectedSockets), '#3927a0'),
    this.series('realtime.rooms', 'adminStats.series.rooms', this.samples().map(s => s.totalRooms), '#854f0b'),
    this.series('realtime.matches', 'adminStats.series.matches', this.samples().map(s => s.playingRooms), '#b0125b'),
  ]));
  protected readonly historicalCpuChart = computed(() => this.historicalChart([
    this.series('history.cpuAverage', 'adminStats.series.cpuAverage', this.historical().map(s => s.cpuPercentAverage), '#d85a30'),
    this.series('history.cpuMaximum', 'adminStats.series.cpuMaximum', this.historical().map(s => s.cpuPercentMaximum), '#ba7517'),
  ]));
  protected readonly historicalMemoryChart = computed(() => this.historicalChart([
    this.series('history.rssAverage', 'adminStats.series.rssAverage', this.historical().map(s => s.rssMbAverage), '#3927a0'),
    this.series('history.rssMaximum', 'adminStats.series.rssMaximum', this.historical().map(s => s.rssMbMaximum), '#b0125b'),
    this.series('history.heapAverage', 'adminStats.series.heapAverage', this.historical().map(s => s.heapUsedMbAverage), '#1d9e75'),
  ]));
  protected readonly historicalLoopChart = computed(() => this.historicalChart([
    this.series('history.eventLoopAverage', 'adminStats.series.eventLoopAverage', this.historical().map(s => s.eventLoopDelayMsAvg), '#ba7517'),
    this.series('history.eventLoopMaximum', 'adminStats.series.eventLoopMaximum', this.historical().map(s => s.eventLoopDelayMsMax), '#a32d2d'),
    this.series('history.tickAverage', 'adminStats.series.tickAverage', this.historical().map(s => s.tickMsAverage), '#185fa5'),
  ]));
  protected readonly historicalActivityChart = computed(() => this.historicalChart([
    this.series('history.playersMaximum', 'adminStats.series.playersMaximum', this.historical().map(s => s.connectedPlayersMax), '#007c68'),
    this.series('history.socketsMaximum', 'adminStats.series.socketsMaximum', this.historical().map(s => s.connectedSocketsMax), '#3927a0'),
    this.series('history.roomsMaximum', 'adminStats.series.roomsMaximum', this.historical().map(s => s.roomsMax), '#854f0b'),
    this.series('history.matchesMaximum', 'adminStats.series.matchesMaximum', this.historical().map(s => s.activeMatchesMax), '#b0125b'),
  ]));

  protected readonly historySummary = computed(() => {
    const rows = this.historical();
    const max = (pick: (row: HistoricalRuntimeMetric) => number) => rows.length
      ? Math.max(...rows.map(pick))
      : 0;
    return {
      periods: rows.length,
      cpuMaximum: max(row => row.cpuPercentMaximum),
      rssMaximum: max(row => row.rssMbMaximum),
      playersMaximum: max(row => row.connectedPlayersMax),
      matchesMaximum: max(row => row.activeMatchesMax),
    };
  });

  ngOnInit(): void {
    this.socket = socketManager.connect(this.auth.accessToken() ?? undefined);
    this.socket.on(SOCKET_EVENTS.ADMIN_STATS.UPDATE, this.onStatsUpdate);
    this.socket.on('connect', this.subscribe);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (this.socket.connected) this.subscribe();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.socket?.emit(SOCKET_EVENTS.ADMIN_STATS.UNSUBSCRIBE);
    this.socket?.off(SOCKET_EVENTS.ADMIN_STATS.UPDATE, this.onStatsUpdate);
    this.socket?.off('connect', this.subscribe);
  }

  protected selectView(view: StatsView): void {
    if (this.activeView() === view) return;
    this.activeView.set(view);
    this.message.set(null);
    if (view === 'history') {
      this.socket?.emit(SOCKET_EVENTS.ADMIN_STATS.UNSUBSCRIBE);
      if (this.historical().length === 0) void this.loadHistory(this.historyHours());
    } else {
      this.subscribe();
    }
  }

  protected async loadHistory(hours = this.historyHours()): Promise<void> {
    this.historyHours.set(hours);
    this.historyLoading.set(true);
    this.message.set(null);
    try {
      this.historical.set(await this.api.history(hours));
    } catch {
      this.message.set({ key: 'adminStats.errors.loadHistory' });
    } finally {
      this.historyLoading.set(false);
    }
  }

  protected async flush(): Promise<void> {
    try {
      const result = await this.api.flush();
      if (this.activeView() === 'history') await this.loadHistory(this.historyHours());
      this.message.set({ key: 'adminStats.flushSuccess', params: { count: result.inserted } });
    } catch {
      this.message.set({ key: 'adminStats.errors.flush' });
    }
  }

  private readonly subscribe = (): void => {
    if (!document.hidden && this.activeView() === 'realtime') {
      this.socket?.emit(SOCKET_EVENTS.ADMIN_STATS.SUBSCRIBE);
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden || this.activeView() === 'history') {
      this.socket?.emit(SOCKET_EVENTS.ADMIN_STATS.UNSUBSCRIBE);
    } else {
      this.socket?.emit(SOCKET_EVENTS.ADMIN_STATS.SUBSCRIBE);
    }
  };

  private readonly onStatsUpdate = (update: StatsUpdate): void => {
    if (update.recent) {
      this.samples.set(update.recent.slice(-900));
      return;
    }
    if (!update.latest) return;
    this.samples.update(samples => [
      ...samples.filter(sample => sample.sampledAt !== update.latest!.sampledAt),
      update.latest!,
    ].slice(-900));
  };

  private series(key: string, labelKey: string, data: number[], color: string): StatsSeries {
    return { key, labelKey, data, color };
  }

  private realtimeChart(series: StatsSeries[]): ChartData<'line'> {
    const samples = this.samples();
    return this.buildChart(
      samples.map(sample => new Date(sample.sampledAt).toLocaleTimeString(this.activeLanguage())),
      series,
    );
  }

  private historicalChart(series: StatsSeries[]): ChartData<'line'> {
    return this.buildChart(
      this.historical().map(row => new Date(row.bucketAt).toLocaleString(this.activeLanguage())),
      series,
    );
  }

  private buildChart(labels: string[], series: StatsSeries[]): ChartData<'line'> {
    return {
      labels,
      datasets: series.map(item => ({
        label: this.transloco.translate(item.labelKey),
        preferenceKey: item.key,
        data: item.data,
        borderColor: item.color,
        backgroundColor: item.color,
        hidden: !this.preferences.isVisible(item.key),
      })),
    };
  }
}
