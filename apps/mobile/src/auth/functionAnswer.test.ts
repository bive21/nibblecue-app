import { describe, expect, it } from 'vitest';
import { functionAnswer } from './functionAnswer';

describe('what a failed Edge Function call said (functionAnswer.ts)', () => {
  it('reads our own function’s body as before: error, detail and the attempts left', () => {
    expect(functionAnswer(422, { error: 'validation_error', detail: 'child.birth_date' })).toEqual({
      ok: false,
      status: 422,
      error: 'validation_error',
      detail: 'child.birth_date',
    });
    expect(functionAnswer(404, { error: 'invalid_invite', attempts_left: 3 })).toEqual({
      ok: false,
      status: 404,
      error: 'invalid_invite',
      attempts_left: 3,
    });
  });

  it('keeps the platform’s own answer when no function ran, instead of a bare server_error', () => {
    // the name is not deployed on this project
    expect(
      functionAnswer(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }),
    ).toEqual({
      ok: false,
      status: 404,
      error: 'NOT_FOUND',
      detail: 'Requested function was not found',
    });
    // it is, and would not start
    expect(
      functionAnswer(503, { code: 'BOOT_ERROR', message: 'Worker failed to boot' }),
    ).toMatchObject({ status: 503, error: 'BOOT_ERROR', detail: 'Worker failed to boot' });
  });

  it('prefers our words to the platform’s when a body somehow has both', () => {
    expect(
      functionAnswer(422, {
        error: 'validation_error',
        detail: 'modules.x',
        code: 'X',
        message: 'y',
      }),
    ).toMatchObject({ error: 'validation_error', detail: 'modules.x' });
  });

  it('falls back to server_error for a body that is empty, not JSON, or not text where text belongs', () => {
    expect(functionAnswer(500, {})).toEqual({ ok: false, status: 500, error: 'server_error' });
    expect(functionAnswer(502, 'Bad gateway')).toEqual({
      ok: false,
      status: 502,
      error: 'server_error',
    });
    expect(functionAnswer(401, { code: 401, message: 'Invalid JWT' })).toEqual({
      ok: false,
      status: 401,
      error: 'server_error',
      detail: 'Invalid JWT',
    });
    expect(functionAnswer(500, { error: '  ', detail: '' })).toEqual({
      ok: false,
      status: 500,
      error: 'server_error',
    });
  });
});
