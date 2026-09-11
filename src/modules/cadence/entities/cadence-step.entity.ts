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

@Entity('cadence_steps')
export class CadenceStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_cadence_steps_cadenceId')
  @Column({ type: 'uuid' })
  cadenceId!: string;

  @ManyToOne(() => Cadence, (cadence) => cadence.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cadenceId' })
  cadence!: Cadence;

  @Column({ type: 'int' })
  stepOrder!: number; // 1 to 10

  @Column({ type: 'varchar', length: 100 })
  title!: string;

  // Interval in hours from the previous step (e.g., Step 1 = 0h, Step 2 = 24h, Step 3 = 48h)
  @Column({ type: 'int', default: 24 })
  delayHours!: number;

  @Column({ type: 'text' })
  messageTemplate!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  mediaUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
