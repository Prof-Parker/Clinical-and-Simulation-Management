import { describe, it, expect } from 'vitest';
import {
  formatTempCredentialTxt,
  buildTempCredentialFilename
} from '../src/ui/users-temp-credentials.js';

describe('temporary credential export helpers', () => {
  it('formats the Power Automate handoff text', () => {
    var text = formatTempCredentialTxt(
      'user@example.edu',
      'TempPass234',
      '2026-08-01T12:00:00.000Z'
    );
    expect(text).toContain('College email: user@example.edu');
    expect(text).toContain('Temporary password: TempPass234');
    expect(text).toContain('Expires: 2026-08-01T12:00:00.000Z');
    expect(text).toContain('ProgramData/temp-credentials/');
    expect(text).toContain('Do not put the password in email');
  });

  it('builds a sanitized dated filename', () => {
    expect(buildTempCredentialFilename("O'Brien Smith", '2026-07-29'))
      .toBe('temp-password_o-brien-smith_2026-07-29.txt');
    expect(buildTempCredentialFilename('', '2026-07-29'))
      .toBe('temp-password_user_2026-07-29.txt');
  });
});
