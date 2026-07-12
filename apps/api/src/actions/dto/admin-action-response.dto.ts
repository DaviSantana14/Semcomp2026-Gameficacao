import { ActionResponseDto } from './action-response.dto';

export class AdminActionResponseDto extends ActionResponseDto {
  claimCodesCount!: number;
  redemptionsCount!: number;
}
