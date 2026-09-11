import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CadenceStep } from './cadence-step.entity';
import { LeadCadenceProgress } from './lead-cadence-progress.entity';

@Entity('cadences')
export class Cadence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_cadences_sessionId')
  @Column({ type: 'varchar' })
  sessionId!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  // Anti-Spam / Contenção Settings
  @Column({ type: 'boolean', default: true })
  stopOnReply!: boolean;

  @Column({ type: 'boolean', default: true })
  workingHoursOnly!: boolean;

  @Column({ type: 'int', default: 8 })
  startHour!: number;

  @Column({ type: 'int', default: 18 })
  endHour!: number;

  @Column({ type: 'int', default: 45 })
  minDelaySeconds!: number;

  @Column({ type: 'int', default: 120 })
  maxDelaySeconds!: number;

  @Column({ type: 'int', default: 100 })
  dailyLimit!: number;

  @OneToMany(() => CadenceStep, (step) => step.cadence, { cascade: true })
  steps!: CadenceStep[];

  @OneToMany(() => LeadCadenceProgress, (lead) => lead.cadence)
  leads!: LeadCadenceProgress[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
