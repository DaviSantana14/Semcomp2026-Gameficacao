import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export interface PaginationResponse<T> {
  items: T[];
  meta: PaginationMetaDto;
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginationResponse<T> {
  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
