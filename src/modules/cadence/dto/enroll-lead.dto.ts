import { IsString, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EnrollLeadDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  leadName?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;
}

export class EnrollBatchLeadsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnrollLeadDto)
  leads!: EnrollLeadDto[];
}
