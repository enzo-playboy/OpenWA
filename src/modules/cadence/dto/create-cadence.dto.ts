import { IsString, IsBoolean, IsOptional, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCadenceStepDto {
  @IsNumber()
  @Min(1)
  @Max(10)
  stepOrder!: number;

  @IsString()
  title!: string;

  @IsNumber()
  @Min(0)
  delayHours!: number;

  @IsString()
  messageTemplate!: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}

export class CreateCadenceDto {
  @IsString()
  sessionId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  stopOnReply?: boolean;

  @IsOptional()
  @IsBoolean()
  workingHoursOnly?: boolean;

  @IsOptional()
  @IsNumber()
  startHour?: number;

  @IsOptional()
  @IsNumber()
  endHour?: number;

  @IsOptional()
  @IsNumber()
  minDelaySeconds?: number;

  @IsOptional()
  @IsNumber()
  maxDelaySeconds?: number;

  @IsOptional()
  @IsNumber()
  dailyLimit?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCadenceStepDto)
  steps!: CreateCadenceStepDto[];
}
