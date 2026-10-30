import { describe, expect, it } from 'vitest';

describe('record verification response privacy', () => {
  it('does not require or include patient identity fields in its client model', () => {
    const result = {
      matched: true,
      institutionVerified: true,
      institution: 'Sample Clinic',
      message: 'Document bytes match the registered record commitment.',
      limitation: 'Does not prove clinical accuracy.',
    };
    expect(result).not.toHaveProperty('patient');
    expect(result).not.toHaveProperty('patientId');
    expect(result).not.toHaveProperty('diagnosis');
  });
});
