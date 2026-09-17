import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { LeadCadenceProgress } from './entities/lead-cadence-progress.entity';
import { CadenceLifecycleService } from './cadence-lifecycle.service';
import { createLogger } from '../../common/services/logger.service';

@Injectable()
export class CadenceTimeoutJob {
  private readonly logger = createLogger('CadenceTimeoutJob');

  constructor(
    @InjectRepository(LeadCadenceProgress, 'data')
    private readonly leadProgressRepo: Repository<LeadCadenceProgress>,
    private readonly lifecycleService: CadenceLifecycleService,
  ) {}

  /**
   * Periodic sweep job for timed-out leads in replied_paused status.
   * Can be invoked via NestJS Cron (@Cron(CronExpression.EVERY_2_HOURS)) or called manually.
   */
  async handleReengageTimeouts(): Promise<{ processedCount: number; processedLeads: string[] }> {
    const config = this.lifecycleService.getConfig();
    const timeoutMs = config.reengageTimeoutHours * 3600 * 1000;
    const cutoffDate = new Date(Date.now() - timeoutMs);

    this.logger.log(
      `Running Cadence Timeout Job (Timeout Threshold: ${config.reengageTimeoutHours}h, Cutoff: ${cutoffDate.toISOString()})...`,
    );

    const timedOutLeads = await this.leadProgressRepo.find({
      where: {
        status: 'replied_paused',
        lastReplyAt: LessThan(cutoffDate),
      },
    });

    const processedLeads: string[] = [];

    for (const lead of timedOutLeads) {
      try {
        const result = await this.lifecycleService.resolveRepliedPaused(lead.id, 'timeout_reengage', {
          summary: `Lead parou de responder após ${config.reengageTimeoutHours}h`,
          reengageContext:
            'Vi que a gente não conseguiu conversar mais cedo — sem problemas! Aproveitando que estou por aqui:',
        });

        if (result) {
          processedLeads.push(lead.phone);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error timing out lead ${lead.phone}: ${errMsg}`);
      }
    }

    this.logger.log(
      `Cadence Timeout Job completed. Processed ${processedLeads.length} timed-out leads out of ${timedOutLeads.length} candidates.`,
    );

    return {
      processedCount: processedLeads.length,
      processedLeads,
    };
  }
}
