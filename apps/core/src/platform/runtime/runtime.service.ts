import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { cpus } from 'node:os';
import { PodmanService } from '../modules/podman.service';
import { findPodmanDbs, PodmanContainer, readPodmanDb } from '../host/podman-db';
import { isLoopback, KNOWN_PORTS, readTcpSockets } from '../host/proc-net';
import { descendants, Proc, readProcs, readRss, socketOwners } from '../host/procs';
import { ConnectionsInfo, ContainerInfo, ContainersInfo } from './runtime.dto';

const INTERVAL_MS = Math.max(2000, Number(process.env.RUNTIME_INTERVAL_MS) || 5000);
const MAX_CONNECTIONS = 300;
const CLK_TCK = 100;

/**
 * Slower-cadence sampler (default every 5 s) for things that cost more than
 * a /proc read: the containers podman knows about (read-only from its state
 * DB) with per-container CPU/memory, and the host's TCP connections with
 * the process or container that owns each socket.
 */
@Injectable()
export class RuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuntimeService.name);
  private timer?: NodeJS.Timeout;
  private prevCpu = new Map<string, { at: number; ticks: number }>();
  private dbWarned = false;
  private dbError: string | null = 'not sampled yet';
  /** last successful DB read, reused while podman holds a write lock */
  private lastPodman: PodmanContainer[] | null = null;

  containers: ContainersInfo = { available: false, error: 'not sampled yet', list: [] };
  connections: ConnectionsInfo | null = null;
  private running?: Promise<void>;

  constructor(private readonly control: PodmanService) {}

  async onModuleInit() {
    await this.control.ready;
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Re-sample now (e.g. right after a start/stop); joins a sample in flight. */
  refresh(): Promise<void> {
    this.running ??= this.sample().finally(() => (this.running = undefined));
    return this.running;
  }

  private async sample() {
    try {
      const procs = await readProcs();
      const [fresh, sockets, owners] = await Promise.all([
        this.readPodman(),
        readTcpSockets(),
        socketOwners(procs.keys()),
      ]);

      if (fresh) this.lastPodman = fresh;
      const podman = fresh ?? this.lastPodman;

      // which pid belongs to which container
      const pidContainer = new Map<number, PodmanContainer>();
      for (const c of podman ?? []) {
        if (c.state !== 'running' || !c.pid) continue;
        for (const pid of descendants(procs, c.pid)) pidContainer.set(pid, c);
      }

      this.containers = podman
        ? { available: true, error: null, list: await this.buildContainers(podman, procs, pidContainer, sockets, owners) }
        : { available: false, error: this.dbError, list: [] };
      this.connections = await this.buildConnections(procs, pidContainer, sockets, owners, podman ?? []);
    } catch (err) {
      this.logger.warn(`runtime sampling failed: ${(err as Error).message}`);
    }
  }

  private async readPodman(): Promise<PodmanContainer[] | null> {
    const dbs = await findPodmanDbs();
    if (!dbs.length) {
      this.dbError = 'No podman database found (needs Podman 4.8+ with the sqlite backend).';
      return null;
    }
    const all: PodmanContainer[] = [];
    let ok = false;
    for (const db of dbs) {
      try {
        all.push(...(await readPodmanDb(db)));
        ok = true;
      } catch (err) {
        this.dbError = `Cannot read ${db}: ${(err as Error).message}`;
        if (!this.dbWarned) {
          this.logger.warn(this.dbError);
          this.dbWarned = true;
        }
      }
    }
    return ok ? all : null;
  }

  private async buildContainers(
    podman: PodmanContainer[],
    procs: Map<number, Proc>,
    pidContainer: Map<number, PodmanContainer>,
    sockets: Awaited<ReturnType<typeof readTcpSockets>>,
    owners: Map<number, number>,
  ): Promise<ContainerInfo[]> {
    const now = Date.now();
    const ncpu = cpus().length || 1;
    const list: ContainerInfo[] = [];
    for (const c of podman) {
      const pids = c.state === 'running' && c.pid ? descendants(procs, c.pid) : [];
      let cpuPercent: number | null = null;
      let memoryBytes: number | null = null;
      if (pids.length) {
        const ticks = pids.reduce((s, p) => s + (procs.get(p)?.cpuTicks ?? 0), 0);
        const prev = this.prevCpu.get(c.id);
        if (prev && now > prev.at) {
          const sec = (ticks - prev.ticks) / CLK_TCK;
          cpuPercent = Math.max(0, Math.round((sec / ((now - prev.at) / 1000) / ncpu) * 1000) / 10);
        }
        this.prevCpu.set(c.id, { at: now, ticks });
        memoryBytes = (await Promise.all(pids.map(readRss))).reduce((a, b) => a + b, 0);
      }

      // host-network containers have no port mappings: report what they listen on
      const listening = new Set<number>();
      if (c.hostNetwork) {
        for (const s of sockets) {
          const pid = owners.get(s.inode);
          if (s.state === 'LISTEN' && pid && pidContainer.get(pid)?.id === c.id) listening.add(s.localPort);
        }
      }

      list.push({
        id: c.id.slice(0, 12),
        name: c.name,
        app: c.project,
        service: c.service,
        image: c.image,
        state: c.state,
        health: c.health,
        startedAt: c.startedAt,
        finishedAt: c.finishedAt,
        exitCode: c.exitCode,
        restartPolicy: c.restartPolicy,
        hostNetwork: c.hostNetwork,
        ports: [
          ...c.ports.map((p) => ({ hostPort: p.hostPort, containerPort: p.containerPort, protocol: p.protocol })),
          ...[...listening].sort((a, b) => a - b).map((p) => ({ hostPort: p, containerPort: p, protocol: 'tcp' })),
        ],
        cpuPercent,
        memoryBytes,
        processes: pids.length,
        self: this.control.isSelf(c.id),
      });
    }
    for (const id of this.prevCpu.keys()) {
      if (!podman.some((c) => c.id === id)) this.prevCpu.delete(id);
    }
    const order = (s: string) => (s === 'running' ? 0 : 1);
    return list.sort((a, b) => order(a.state) - order(b.state) || a.name.localeCompare(b.name));
  }

  private async buildConnections(
    procs: Map<number, Proc>,
    pidContainer: Map<number, PodmanContainer>,
    sockets: Awaited<ReturnType<typeof readTcpSockets>>,
    owners: Map<number, number>,
    podman: PodmanContainer[],
  ): Promise<ConnectionsInfo> {
    // host port -> container, for rootless port forwarding (the socket is
    // held by pasta/rootlessport, not by the container's own process)
    const portContainer = new Map<number, PodmanContainer>();
    for (const c of podman) {
      if (c.state === 'running') for (const p of c.ports) portContainer.set(p.hostPort, c);
    }
    const label = (pid: number | undefined) => {
      if (!pid) return { process: null, container: null };
      const c = pidContainer.get(pid);
      return { process: procs.get(pid)?.comm ?? null, container: c ? c.project ?? c.name : null };
    };

    const counts: Record<string, number> = {};
    const listenMap = new Map<string, ConnectionsInfo['listening'][number]>();
    const listenPorts = new Map<number, { process: string | null; container: string | null }>();
    for (const s of sockets) {
      counts[s.state] = (counts[s.state] ?? 0) + 1;
      if (s.state !== 'LISTEN') continue;
      const own = label(owners.get(s.inode));
      const fwd = portContainer.get(s.localPort);
      const who = {
        process: own.process,
        container: own.container ?? (fwd ? fwd.project ?? fwd.name : null),
      };
      const key = `${s.localAddress}:${s.localPort}`;
      if (!listenMap.has(key)) {
        listenMap.set(key, {
          address: s.localAddress,
          port: s.localPort,
          ...who,
          service: who.container ?? who.process ?? KNOWN_PORTS[s.localPort] ?? null,
          loopback: isLoopback(s.localAddress),
        });
      }
      if (!listenPorts.has(s.localPort) || who.container || who.process) listenPorts.set(s.localPort, who);
    }

    const established: ConnectionsInfo['established'] = [];
    for (const s of sockets) {
      if (s.state !== 'ESTABLISHED') continue;
      const inbound = listenPorts.has(s.localPort);
      const own = label(owners.get(s.inode));
      const svc = inbound ? listenPorts.get(s.localPort)! : own;
      established.push({
        direction: inbound ? 'in' : 'out',
        localAddress: s.localAddress,
        localPort: s.localPort,
        remoteAddress: s.remoteAddress,
        remotePort: s.remotePort,
        process: own.process ?? svc.process,
        container: own.container ?? svc.container,
        service:
          own.container ?? svc.container ?? own.process ?? svc.process ??
          KNOWN_PORTS[inbound ? s.localPort : s.remotePort] ?? null,
        loopback: isLoopback(s.remoteAddress),
      });
    }
    established.sort(
      (a, b) =>
        Number(a.loopback) - Number(b.loopback) ||
        (a.service ?? '~').localeCompare(b.service ?? '~') ||
        a.remoteAddress.localeCompare(b.remoteAddress),
    );

    return {
      counts,
      listening: [...listenMap.values()].sort((a, b) => a.port - b.port || a.address.localeCompare(b.address)),
      established: established.slice(0, MAX_CONNECTIONS),
      totalEstablished: established.length,
      remoteHosts: new Set(established.filter((e) => !e.loopback).map((e) => e.remoteAddress)).size,
    };
  }
}
