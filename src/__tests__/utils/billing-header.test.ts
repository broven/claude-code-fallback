import { describe, it, expect } from 'vitest';
import { stripBillingHeaderCch } from '../../utils/billing-header';

describe('stripBillingHeaderCch', () => {
  it('should remove cch parameter from billing header', () => {
    const body = {
      system: [
        {
          type: 'text',
          text: 'x-anthropic-billing-header: cc_version=2.1.38.713; cc_entrypoint=sdk-ts; cch=90d92;'
        }
      ]
    };

    stripBillingHeaderCch(body);

    expect(body.system[0].text).toBe('x-anthropic-billing-header: cc_version=2.1.38.713; cc_entrypoint=sdk-ts; ');
  });

  it('should handle billing header with cch in different position', () => {
    const body = {
      system: [
        {
          type: 'text',
          text: 'x-anthropic-billing-header: cch=90d92; cc_version=2.1.38.713; cc_entrypoint=sdk-ts;'
        }
      ]
    };

    stripBillingHeaderCch(body);

    // Note: trailing space might remain depending on regex, checking for containment of critical parts
    expect(body.system[0].text).toContain('cc_version=2.1.38.713;');
    expect(body.system[0].text).toContain('cc_entrypoint=sdk-ts;');
    expect(body.system[0].text).not.toContain('cch=90d92');
  });

  it('should not modify other system messages', () => {
    const body = {
      system: [
        {
          type: 'text',
          text: 'You are a helpful assistant.'
        }
      ]
    };

    stripBillingHeaderCch(body);

    expect(body.system[0].text).toBe('You are a helpful assistant.');
  });

  it('should handle missing or invalid system field', () => {
    const body1 = {};
    stripBillingHeaderCch(body1);
    expect(body1).toEqual({});

    const body2 = { system: 'not-an-array' };
    stripBillingHeaderCch(body2);
    expect(body2.system).toBe('not-an-array');
  });
});
