import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ai_interaction_logs')
export class AiLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  sessionId!: string;

  @Column()
  chatId!: string;

  @Column({ type: 'text' })
  userMessage!: string;

  @Column({ type: 'text' })
  aiResponse!: string;

  @Column({ default: 'google/gemini-2.5-flash-free' })
  model!: string;

  @Column({ type: 'int', default: 0 })
  tokensUsed!: number;

  @Column({ type: 'int', default: 0 })
  durationMs!: number;

  @Column({ default: 'success' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
