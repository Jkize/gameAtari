export interface RuntimeMetricSample {
  sampledAt: string;
  cpuPercent: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  availableMemoryMb: number;
  eventLoopUtilization: number;
  eventLoopDelayMs: number;
  connectedPlayers: number;
  connectedSockets: number;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  tick: { targetMs: number; averageMs: number; delayedTicks: number };
  uptimeSeconds: number;
}

export interface HistoricalRuntimeMetric {
  id: string;
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
}
