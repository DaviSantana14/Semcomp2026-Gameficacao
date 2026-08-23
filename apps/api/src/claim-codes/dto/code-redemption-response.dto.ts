import { ApiProperty } from '@nestjs/swagger';
import { ActionRedemptionMethod } from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

class CodeRedemptionParticipantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

class CodeRedemptionActionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class CodeRedemptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: CodeRedemptionParticipantDto })
  participant!: CodeRedemptionParticipantDto;
  @ApiProperty({ type: CodeRedemptionActionDto, nullable: true })
  action!: CodeRedemptionActionDto | null;
  @ApiProperty({ enum: ActionRedemptionMethod })
  method!: ActionRedemptionMethod;
  @ApiProperty({ nullable: true, description: 'Código sempre mascarado.' })
  code!: string | null;
  @ApiProperty() points!: number;
  @ApiProperty() xpDelta!: number;
  @ApiProperty() createdAt!: string;
}

export class CodeRedemptionsPageResponseDto {
  @ApiProperty({ type: [CodeRedemptionResponseDto] })
  items!: CodeRedemptionResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
