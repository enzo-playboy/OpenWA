import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_knowledge_items')
export class AiKnowledge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ default: 'Geral' })
  category!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'simple-array', nullable: true })
  tags!: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
