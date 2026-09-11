import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cadence } from './entities/cadence.entity';
import { CadenceStep } from './entities/cadence-step.entity';
import { LeadCadenceProgress } from './entities/lead-cadence-progress.entity';
import { CreateCadenceDto } from './dto/create-cadence.dto';
import { EnrollLeadDto } from './dto/enroll-lead.dto';

import { SupabaseSyncService } from './supabase-sync.service';

@Injectable()
export class CadenceService {
  constructor(
    @InjectRepository(Cadence, 'data')
    private readonly cadenceRepository: Repository<Cadence>,
    @InjectRepository(CadenceStep, 'data')
    private readonly cadenceStepRepository: Repository<CadenceStep>,
    @InjectRepository(LeadCadenceProgress, 'data')
    private readonly leadProgressRepository: Repository<LeadCadenceProgress>,
    private readonly supabaseSync: SupabaseSyncService,
  ) {}

  async createCadence(dto: CreateCadenceDto): Promise<Cadence> {
    if (!dto.steps || dto.steps.length === 0) {
      throw new BadRequestException('Cadence must have at least 1 step');
    }
    if (dto.steps.length > 10) {
      throw new BadRequestException('Cadence cannot have more than 10 steps');
    }

    const cadence = this.cadenceRepository.create({
      sessionId: dto.sessionId,
      name: dto.name,
      description: dto.description ?? null,
      stopOnReply: dto.stopOnReply ?? true,
      workingHoursOnly: dto.workingHoursOnly ?? true,
      startHour: dto.startHour ?? 8,
      endHour: dto.endHour ?? 18,
      minDelaySeconds: dto.minDelaySeconds ?? 45,
      maxDelaySeconds: dto.maxDelaySeconds ?? 120,
      dailyLimit: dto.dailyLimit ?? 100,
      steps: dto.steps.map((s) =>
        this.cadenceStepRepository.create({
          stepOrder: s.stepOrder,
          title: s.title,
          delayHours: s.delayHours,
          messageTemplate: s.messageTemplate,
          mediaUrl: s.mediaUrl ?? null,
        }),
      ),
    });

    return this.cadenceRepository.save(cadence);
  }

  async findAllCadences(sessionId?: string): Promise<Cadence[]> {
    const query = this.cadenceRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.steps', 's')
      .orderBy('s.stepOrder', 'ASC');

    if (sessionId) {
      query.where('c.sessionId = :sessionId', { sessionId });
    }

    return query.getMany();
  }

  async findCadenceById(id: string): Promise<Cadence> {
    const cadence = await this.cadenceRepository.findOne({
      where: { id },
      relations: { steps: true },
      order: { steps: { stepOrder: 'ASC' } },
    });
    if (!cadence) {
      throw new NotFoundException(`Cadence ${id} not found`);
    }
    return cadence;
  }

  async enrollLeads(cadenceId: string, leads: EnrollLeadDto[]): Promise<LeadCadenceProgress[]> {
    const cadence = await this.findCadenceById(cadenceId);
    if (!cadence.enabled) {
      throw new BadRequestException('Cadence is disabled');
    }

    const now = new Date();
    const enrolled: LeadCadenceProgress[] = [];

    for (const leadDto of leads) {
      const cleanPhone = leadDto.phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.includes('@')
        ? cleanPhone
        : `${cleanPhone}@c.us`;

      // Check if lead is already in this cadence and active
      let progress = await this.leadProgressRepository.findOne({
        where: { cadenceId, phone: formattedPhone },
      });

      if (!progress) {
        progress = this.leadProgressRepository.create({
          cadenceId: cadence.id,
          sessionId: cadence.sessionId,
          phone: formattedPhone,
          leadName: leadDto.leadName ?? null,
          variables: leadDto.variables ?? null,
          currentStep: 0,
          status: 'active',
          nextRunAt: now, // Run step 1 immediately or within jitter window
        });
      } else {
        progress.status = 'active';
        progress.currentStep = 0;
        progress.nextRunAt = now;
      }

      enrolled.push(await this.leadProgressRepository.save(progress));
    }

    return enrolled;
  }

  async pauseLead(progressId: string): Promise<LeadCadenceProgress> {
    const lead = await this.leadProgressRepository.findOne({ where: { id: progressId } });
    if (!lead) throw new NotFoundException(`Lead ${progressId} not found`);
    lead.status = 'stopped';
    return this.leadProgressRepository.save(lead);
  }

  async resumeLead(progressId: string): Promise<LeadCadenceProgress> {
    const lead = await this.leadProgressRepository.findOne({ where: { id: progressId } });
    if (!lead) throw new NotFoundException(`Lead ${progressId} not found`);
    lead.status = 'active';
    lead.nextRunAt = new Date();
    return this.leadProgressRepository.save(lead);
  }

  async getCadenceStats(cadenceId: string) {
    const cadence = await this.findCadenceById(cadenceId);
    const totalLeads = await this.leadProgressRepository.count({ where: { cadenceId } });
    const activeLeads = await this.leadProgressRepository.count({
      where: { cadenceId, status: 'active' },
    });
    const completedLeads = await this.leadProgressRepository.count({
      where: { cadenceId, status: 'completed' },
    });
    const repliedLeads = await this.leadProgressRepository.count({
      where: { cadenceId, status: 'replied_paused' },
    });
    const stoppedLeads = await this.leadProgressRepository.count({
      where: { cadenceId, status: 'stopped' },
    });

    return {
      cadenceId: cadence.id,
      name: cadence.name,
      totalLeads,
      activeLeads,
      completedLeads,
      repliedLeads,
      stoppedLeads,
      conversionRate: totalLeads > 0 ? ((repliedLeads / totalLeads) * 100).toFixed(1) + '%' : '0%',
      stepsCount: cadence.steps.length,
    };
  }

  async importFromSupabase(cadenceId: string, limit = 50): Promise<LeadCadenceProgress[]> {
    if (!this.supabaseSync.isConfigured()) {
      throw new BadRequestException('Supabase URL or Key is missing in .env configuration');
    }

    const supabaseLeads = await this.supabaseSync.fetchLeadsFromSupabase(limit);
    if (!supabaseLeads || supabaseLeads.length === 0) {
      return [];
    }

    const enrollDtos: EnrollLeadDto[] = supabaseLeads.map((item) => ({
      phone: item.phone,
      leadName: item.name,
      variables: item.metadata || {},
    }));

    const enrolled = await this.enrollLeads(cadenceId, enrollDtos);

    // Update status in Supabase to 'enrolled'
    for (const item of supabaseLeads) {
      void this.supabaseSync.updateLeadStatusInSupabase(item.phone, { status: 'enrolled' });
    }

    return enrolled;
  }

  /**
   * Pausa automaticamente a cadência de um lead caso ele responda e stopOnReply seja true
   */
  async handleInboundReply(sessionId: string, phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@c.us`;

    const activeProgress = await this.leadProgressRepository.find({
      where: { sessionId, phone: formattedPhone, status: 'active' },
      relations: { cadence: true },
    });

    let pausedAny = false;
    for (const prog of activeProgress) {
      if (prog.cadence?.stopOnReply) {
        prog.status = 'replied_paused';
        await this.leadProgressRepository.save(prog);
        pausedAny = true;
      }
    }
    return pausedAny;
  }

  /**
   * Estatísticas em tempo real do Funil de Vendas (Estratégia do Pequeno Sim)
   */
  async getGlobalFunnelStats() {
    const totalLeads = await this.leadProgressRepository.count();
    
    const enviadas = await this.leadProgressRepository
      .createQueryBuilder('p')
      .where('p.currentStep > 0 OR p.lastSentAt IS NOT NULL')
      .getCount();

    const responded = await this.leadProgressRepository
      .createQueryBuilder('p')
      .where("p.status = 'replied_paused' OR p.lastReplyAt IS NOT NULL")
      .getCount();

    const proposta = await this.leadProgressRepository
      .createQueryBuilder('p')
      .where("p.status = 'completed' OR p.variables LIKE '%proposta%' OR p.variables LIKE '%high_ticket%'")
      .getCount();

    const fechados = await this.leadProgressRepository
      .createQueryBuilder('p')
      .where("p.variables LIKE '%fechado%' OR p.variables LIKE '%closed%' OR p.variables LIKE '%venda%'")
      .getCount();

    return {
      prospectados: totalLeads,
      enviados: enviadas,
      responded: responded,
      proposta: proposta,
      fechados: fechados,
      supabaseConfigured: this.supabaseSync.isConfigured(),
    };
  }
}
