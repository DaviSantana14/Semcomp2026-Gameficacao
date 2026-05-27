import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RewardResponseDto {
  @ApiProperty({ example: 'clxreward123' })
  id: string;

  @ApiProperty({ example: 'Camiseta Semcomp 2026' })
  name: string;

  @ApiPropertyOptional({ example: 'Camiseta oficial do evento.' })
  description?: string | null;

  @ApiProperty({ example: 100 })
  costInPoints: number;

  @ApiProperty({ example: 25 })
  stock: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/camiseta.png' })
  imageUrl?: string | null;

  @ApiProperty({ example: '2026-05-17T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-17T12:00:00.000Z' })
  updatedAt: Date;

  constructor(data: RewardResponseSource) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.costInPoints = data.costInPoints;
    this.stock = data.stock;
    this.isActive = data.isActive;
    this.imageUrl = data.imageUrl;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}

export type RewardResponseSource = {
  id: string;
  name: string;
  description: string | null;
  costInPoints: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toRewardResponseDto(reward: RewardResponseSource) {
  return new RewardResponseDto(reward);
}
