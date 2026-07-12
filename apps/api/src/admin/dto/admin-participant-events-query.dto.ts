import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export class AdminParticipantEventsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn([
    'all',
    'action_redeem',
    'admin_grant',
    'admin_adjust',
    'reward_redemption',
  ])
  source?:
    | 'all'
    | 'action_redeem'
    | 'admin_grant'
    | 'admin_adjust'
    | 'reward_redemption';

  @IsOptional()
  @IsIn(['all', 'credit', 'debit'])
  kind?: 'all' | 'credit' | 'debit';
}
