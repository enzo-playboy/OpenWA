import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Cadence } from './cadence.entity';
import { jsonColumnType } from '../../../common/utils/column-types';

export type CadenceLeadStatus =
  | 'active'
  | 'completed'
  | 'replied_paused'
  | 'manual_protected_paused'
  | 'stopped'
  | 'failed'
  | 'qualified'
  | 'nurture_cadence'
  | 'manual_handoff'
  | 'reengaged';

@Entity('lead_cadence_progress')
export class LeadCadenceProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_lead_cadence_progress_cadenceId')
  @Column({ type: 'uuid' })
  cadenceId!: string;

  @ManyToOne(() => Cadence, cadence => cadence.leads, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cadenceId' })
  cadence!: Cadence;

  @Index('IDX_lead_cadence_progress_sessionId')
  @Column({ type: 'varchar' })
  sessionId!: string;

  @Index('IDX_lead_cadence_progress_phone')
  @Column({ type: 'varchar', length: 50 })
  phone!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  leadName!: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  variables!: Record<string, any> | null;

  @Column({ type: 'int', default: 0 })
  currentStep!: number; // 0 means waiting for step 1

  @Index('IDX_lead_cadence_progress_status')
  @Column({
    type: 'varchar',
    length: 30,
    default: 'active',
  })
  status!: CadenceLeadStatus;

  @Column({ type: 'int', default: 0 })
  reengageCycles!: number;

  @Column({ type: 'text', nullable: true })
  lastOutcomeReason!: string | null;

  @Index('IDX_lead_cadence_progress_nextRunAt')
  @Column({ type: 'datetime', nullable: true })
  nextRunAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastReplyAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
