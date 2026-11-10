// Classes, not interfaces: the @nestjs/swagger CLI plugin (nest-cli.json)
// reads them into the OpenAPI document, so the web app gets the same types.

export class ContainerPort {
  hostPort!: number;
  containerPort!: number;
  protocol!: string;
}

export class ContainerInfo {
  id!: string;
  name!: string;
  /** compose project, i.e. the outpost app directory */
  app!: string | null;
  service!: string | null;
  image!: string | null;
  state!: string;
  health!: string | null;
  startedAt!: number | null;
  finishedAt!: number | null;
  exitCode!: number | null;
  restartPolicy!: string | null;
  hostNetwork!: boolean;
  ports!: ContainerPort[];
  /** share of the whole machine, percent */
  cpuPercent!: number | null;
  memoryBytes!: number | null;
  processes!: number;
  /** the container core runs in (cannot be stopped from here) */
  self!: boolean;
}

export class ContainersInfo {
  available!: boolean;
  error!: string | null;
  list!: ContainerInfo[];
}

export class ListeningSocket {
  address!: string;
  port!: number;
  process!: string | null;
  container!: string | null;
  service!: string | null;
  loopback!: boolean;
}

export class EstablishedSocket {
  direction!: 'in' | 'out';
  localAddress!: string;
  localPort!: number;
  remoteAddress!: string;
  remotePort!: number;
  process!: string | null;
  container!: string | null;
  service!: string | null;
  loopback!: boolean;
}

export class ConnectionsInfo {
  /** TCP sockets per state (ESTABLISHED, LISTEN, TIME_WAIT, ...) */
  counts!: Record<string, number>;
  listening!: ListeningSocket[];
  established!: EstablishedSocket[];
  totalEstablished!: number;
  /** distinct non-loopback peers */
  remoteHosts!: number;
}
