import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkClaimCodeStatusDto } from '../dto/bulk-claim-code-status.dto';

describe('BulkClaimCodeStatusDto', () => {
  it('accepts bounded unique ids and trims the reason', async () => {
    const dto = plainToInstance(BulkClaimCodeStatusDto, {
      ids: ['code-2', 'code-1'],
      isActive: false,
      reason: '  Desativacao preventiva dos codigos selecionados  ',
      confirmation: 'DESATIVAR',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      ids: ['code-2', 'code-1'],
      reason: 'Desativacao preventiva dos codigos selecionados',
      confirmation: 'DESATIVAR',
    });
  });

  it.each([
    ['empty ids', []],
    ['blank id', ['  ']],
    [
      'too many ids',
      Array.from({ length: 501 }, (_, index) => `code-${index}`),
    ],
    ['duplicate ids', ['code-1', 'code-1']],
  ])('rejects %s', async (_label, ids) => {
    const dto = plainToInstance(BulkClaimCodeStatusDto, {
      ids,
      isActive: false,
      reason: 'Desativacao preventiva dos codigos selecionados',
      confirmation: 'DESATIVAR',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('requires the confirmation word for the requested status', async () => {
    const dto = plainToInstance(BulkClaimCodeStatusDto, {
      ids: ['code-1'],
      isActive: true,
      reason: 'Ativacao preventiva do codigo selecionado',
      confirmation: 'DESATIVAR',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('requires a trimmed reason between 10 and 500 characters', async () => {
    const dto = plainToInstance(BulkClaimCodeStatusDto, {
      ids: ['code-1'],
      isActive: false,
      reason: '  curto  ',
      confirmation: 'DESATIVAR',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
