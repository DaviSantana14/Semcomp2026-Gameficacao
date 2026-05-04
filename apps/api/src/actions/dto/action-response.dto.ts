import { ActionType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class ActionResponseDto {
  @ApiProperty({
    example: 'cmorflmuj000018bwz5k348xe',
  })
  id: string;

  @ApiProperty({
    example: 'Check-in Dia 1',
  })
  name: string;

  @ApiProperty({
    example: 'Presença registrada no primeiro dia da Semcomp.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    enum: ActionType,
    example: ActionType.CHECKIN,
  })
  type: ActionType;

  @ApiProperty({
    example: 10,
  })
  points: number;

  @ApiProperty({
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    example: '2026-05-04T16:46:16.555Z',
    type: String,
  })
  createdAt: Date;

  constructor(data: ActionResponseSource) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type;
    this.points = data.points;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt;
  }
}

export type ActionResponseSource = {
  id: string;
  name: string;
  description: string | null;
  type: ActionType;
  points: number;
  isActive: boolean;
  createdAt: Date;
};

export function toActionResponseDto(action: ActionResponseSource) {
  return new ActionResponseDto(action);
}
