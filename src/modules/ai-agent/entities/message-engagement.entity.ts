import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type OpeningStyle = 'question' | 'statement' | 'context' | 'direct_offer';

@Entity('message_engagements')
export class MessageEngagement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_message_engagement_leadId')
  @Column({ type: 'varchar' })
  leadId!: string;

  @Index('IDX_message_engagement_phone')
  @Column({ type: 'varchar', length: 50 })
  phone!: string;

  @Column({ type: 'varchar', default: 'chip-default' })
  sessionId!: string;

  @Index('IDX_message_engagement_personaId')
  @Column({ type: 'varchar', default: 'sdr-default' })
  personaId!: string;

  @Column({ type: 'varchar', length: 30, default: 'statement' })
  openingStyle!: OpeningStyle;

  @Column({ type: 'varchar', length: 64 })
  messageHash!: string;

  @Column({ type: 'datetime' })
  sentAt!: Date;

  @Index('IDX_message_engagement_leadReplied')
  @Column({ type: 'boolean', default: false })
  leadReplied!: boolean;

  @Column({ type: 'datetime', nullable: true })
  repliedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  replyLatencyMinutes!: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  outcome!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
