import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ListReconciliationDto,
  ReconciliationFilter,
} from '../dto/list-reconciliation.dto';

describe(ListReconciliationDto.name, () => {
  it('defaults to the first page and all participants', async () => {
    const dto = plainToInstance(ListReconciliationDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 1,
      limit: 20,
      filter: ReconciliationFilter.ALL,
    });
  });

  it('trims search and accepts the divergent filter', async () => {
    const dto = plainToInstance(ListReconciliationDto, {
      page: '2',
      limit: '25',
      search: '  ana@example.test  ',
      filter: 'divergent',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 25,
      search: 'ana@example.test',
      filter: ReconciliationFilter.DIVERGENT,
    });
  });

  it.each([
    [{ filter: 'consistent' }, 'unsupported filter'],
    [{ search: 'x'.repeat(101) }, 'oversized search'],
    [{ page: '0' }, 'invalid page'],
  ])('rejects %s (%s)', async (input) => {
    const dto = plainToInstance(ListReconciliationDto, input);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
