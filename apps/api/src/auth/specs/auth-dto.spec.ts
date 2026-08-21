import { plainToInstance } from 'class-transformer';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';

describe('auth DTO contracts', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const validateBody = (
    body: unknown,
    metatype: Parameters<ValidationPipe['transform']>[1]['metatype'],
  ) =>
    Promise.resolve().then(() =>
      pipe.transform(body, { type: 'body', metatype }),
    );

  it('normalizes only the participant login email and never trims the password', () => {
    expect(
      plainToInstance(LoginDto, {
        email: ' ADA@EXAMPLE.COM ',
        password: '        ',
      }),
    ).toMatchObject({ email: 'ada@example.com', password: '        ' });
  });

  it('rejects the legacy CPF-based participant login payload', async () => {
    await expect(
      validateBody({ cpf: '52998224725', email: 'ada@example.com' }, LoginDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('strips any extra property when only whitelisting is enabled', async () => {
    const strippingPipe = new ValidationPipe({
      whitelist: true,
      transform: true,
    });
    const value = (await strippingPipe.transform(
      { cpf: '52998224725', email: ' ADA@EXAMPLE.COM ', password: '        ' },
      { type: 'body', metatype: LoginDto },
    )) as LoginDto & { cpf?: unknown };

    expect(value.cpf).toBeUndefined();
    expect(value).toMatchObject({
      email: 'ada@example.com',
      password: '        ',
    });
  });

  it('requires an email and a password for participant login', () => {
    const errors = validateSync(plainToInstance(LoginDto, {}));
    const errorProperties = errors.map((error) => error.property);

    expect(errorProperties).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('keeps administrator login independent with CPF, email and password', () => {
    expect(
      plainToInstance(AdminLoginDto, {
        cpf: ' 529.982.247-25 ',
        email: ' ADMIN@SEMCOMP.DEV ',
        password: 'a'.repeat(12),
      }),
    ).toMatchObject({
      cpf: '52998224725',
      email: 'admin@semcomp.dev',
      password: 'a'.repeat(12),
    });
  });

  it('requires a registration password without trimming it', () => {
    expect(
      plainToInstance(RegisterDto, {
        name: '  Ada Lovelace  ',
        cpf: ' 529.982.247-25 ',
        email: ' ADA@EXAMPLE.COM ',
        password: '  senha livre  ',
      }),
    ).toMatchObject({
      name: 'Ada Lovelace',
      cpf: '52998224725',
      email: 'ada@example.com',
      password: '  senha livre  ',
    });
  });

  it.each(['a'.repeat(7), 'a'.repeat(65), undefined])(
    'rejects registration passwords outside the character bounds: %p',
    (password) => {
      const errors = validateSync(
        plainToInstance(RegisterDto, {
          name: 'Ada',
          cpf: '52998224725',
          email: 'ada@example.com',
          password,
        }),
      );

      expect(errors.some((error) => error.property === 'password')).toBe(true);
    },
  );
});
