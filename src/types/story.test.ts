import { describe, it, expect } from 'vitest';
import { validateSentence, validateStoryTitle } from './story.js';

describe('Story Validation', () => {
  describe('validateSentence', () => {
    it('should accept valid sentences', () => {
      expect(validateSentence('This is a valid sentence.')).toBe(true);
      expect(validateSentence('Short.')).toBe(true);
    });

    it('should reject empty or whitespace-only sentences', () => {
      expect(validateSentence('')).toBe(false);
      expect(validateSentence('   ')).toBe(false);
      expect(validateSentence('\n\t')).toBe(false);
    });

    it('should reject sentences that are too long', () => {
      const longSentence = 'a'.repeat(281);
      expect(validateSentence(longSentence)).toBe(false);
    });

    it('should accept sentences at the character limit', () => {
      const maxLengthSentence = 'a'.repeat(280);
      expect(validateSentence(maxLengthSentence)).toBe(true);
    });
  });

  describe('validateStoryTitle', () => {
    it('should accept valid titles', () => {
      expect(validateStoryTitle('My Great Story')).toBe(true);
      expect(validateStoryTitle('A')).toBe(true);
    });

    it('should reject empty or whitespace-only titles', () => {
      expect(validateStoryTitle('')).toBe(false);
      expect(validateStoryTitle('   ')).toBe(false);
    });

    it('should reject titles that are too long', () => {
      const longTitle = 'a'.repeat(101);
      expect(validateStoryTitle(longTitle)).toBe(false);
    });

    it('should accept titles at the character limit', () => {
      const maxLengthTitle = 'a'.repeat(100);
      expect(validateStoryTitle(maxLengthTitle)).toBe(true);
    });
  });
});