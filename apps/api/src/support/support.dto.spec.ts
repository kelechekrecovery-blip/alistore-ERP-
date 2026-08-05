import { validate } from 'class-validator';
import { OpenGuestTicketDto } from './support.dto';

describe('OpenGuestTicketDto', () => {
  it('rejects a phone whose digit identity starts with zero', async () => {
    const dto = Object.assign(new OpenGuestTicketDto(), {
      phone: '0996700123456',
      channel: 'web',
      subject: 'Нужна помощь',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });
});
