CREATE TABLE "NodeRuntimeMetricMinute" (
  "id" UUID NOT NULL,
  "instanceId" TEXT NOT NULL,
  "bucketAt" TIMESTAMP(3) NOT NULL,
  "eligibleSamples" INTEGER NOT NULL,
  "cpuPercentAverage" DOUBLE PRECISION NOT NULL,
  "cpuPercentMaximum" DOUBLE PRECISION NOT NULL,
  "rssMbAverage" DOUBLE PRECISION NOT NULL,
  "rssMbMaximum" DOUBLE PRECISION NOT NULL,
  "heapUsedMbAverage" DOUBLE PRECISION NOT NULL,
  "heapUsedMbMaximum" DOUBLE PRECISION NOT NULL,
  "availableMemoryMbAvg" DOUBLE PRECISION NOT NULL,
  "eventLoopUtilAvg" DOUBLE PRECISION NOT NULL,
  "eventLoopUtilMax" DOUBLE PRECISION NOT NULL,
  "eventLoopDelayMsAvg" DOUBLE PRECISION NOT NULL,
  "eventLoopDelayMsMax" DOUBLE PRECISION NOT NULL,
  "tickMsAverage" DOUBLE PRECISION NOT NULL,
  "tickMsMaximum" DOUBLE PRECISION NOT NULL,
  "connectedPlayersMax" INTEGER NOT NULL,
  "connectedSocketsMax" INTEGER NOT NULL,
  "roomsMax" INTEGER NOT NULL,
  "activeMatchesMax" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NodeRuntimeMetricMinute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NodeRuntimeMetricMinute_instanceId_bucketAt_key"
  ON "NodeRuntimeMetricMinute"("instanceId", "bucketAt");
CREATE INDEX "NodeRuntimeMetricMinute_bucketAt_idx"
  ON "NodeRuntimeMetricMinute"("bucketAt");
