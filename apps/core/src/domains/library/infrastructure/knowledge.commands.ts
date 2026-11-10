import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModulesService } from '../../../platform/modules/modules.service';
import { PodmanService } from '../../../platform/modules/podman.service';
import { moduleDown } from '../../../platform/upstream/upstream.service';

/**
 * The knowledge container's own tool (container/knowledge.sh), run through
 * podman exec: kiwix-serve has no API for downloads, and core's host mount
 * is read-only, so the container writes the selection and downloads itself.
 * Long work (the sync) is detached by the tool; these calls return quickly.
 */
@Injectable()
export class KnowledgeCommands {
  private readonly logger = new Logger(KnowledgeCommands.name);

  constructor(
    private readonly modules: ModulesService,
    private readonly podman: PodmanService,
  ) {}

  /** New selection: stops a running sync, deletes deselected books, downloads the rest in the background. */
  apply(keys: string[]): Promise<void> {
    return this.run(['apply', ...keys]);
  }

  /** Download missing selected books (update: also newer versions) in the background. */
  sync(update: boolean): Promise<void> {
    return this.run(update ? ['sync-bg', '--update'] : ['sync-bg']);
  }

  private async run(args: string[]): Promise<void> {
    const m = this.modules.get('knowledge');
    if (!m || !this.modules.isInstalled('knowledge')) {
      throw new NotFoundException({ statusCode: 404, message: 'Library is not installed: run ./install.sh.', module: 'knowledge' });
    }
    if (!this.modules.isRunning('knowledge')) throw moduleDown(m);
    let result: { exitCode: number; output: string[] };
    try {
      result = await this.podman.exec(m.containerName, ['knowledge', ...args]);
    } catch (err) {
      throw new BadGatewayException(`Could not run the library tool: ${(err as Error).message}`);
    }
    for (const line of result.output) this.logger.log(line);
    if (result.exitCode !== 0) {
      const last = result.output.at(-1) ?? `exit code ${result.exitCode}`;
      throw new BadGatewayException(`The library tool failed: ${last.replace(/^\[\w+\]\s*/, '')}`);
    }
  }
}
