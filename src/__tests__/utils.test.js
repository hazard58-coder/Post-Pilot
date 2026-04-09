// ─────────────────────────────────────────────────────────────
// TEST EXAMPLES — What Unit Tests Should Cover
// Run with: npm test
// Install dependencies: npm install --save-dev jest @testing-library/react @testing-library/jest-dom
// ─────────────────────────────────────────────────────────────

import { isValidEmail, parseCSVLine, parseScheduleDate, generateId } from '../utils-improved';

describe('Validation Functions', () => {
  describe('isValidEmail', () => {
    it('should accept valid email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('john.doe@company.co.uk')).toBe(true);
      expect(isValidEmail('test+tag@domain.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@localhost')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
      expect(isValidEmail('.user@example.com')).toBe(false);
      expect(isValidEmail('user..name@example.com')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail('   ')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidEmail('User@EXAMPLE.COM')).toBe(true);
      expect(isValidEmail('USER@example.com')).toBe(true);
    });
  });
});

describe('CSV Parsing', () => {
  describe('parseCSVLine', () => {
    it('should parse simple CSV lines', () => {
      expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted fields', () => {
      expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    it('should handle escaped quotes', () => {
      expect(parseCSVLine('"Hello ""World"""')).toEqual(['Hello "World"']);
    });

    it('should handle empty fields', () => {
      expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('should trim whitespace', () => {
      expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    it('should handle edge cases', () => {
      expect(parseCSVLine('')).toEqual(['']);
      expect(parseCSVLine(',')).toEqual(['', '']);
      expect(parseCSVLine('a,b,')).toEqual(['a', 'b']);
    });
  });

  describe('parseScheduleDate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-09'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should parse ISO date format', () => {
      const result = parseScheduleDate('2026-05-15', '14:30');
      expect(result).toBeTruthy();
      const date = new Date(result);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(4); // May
      expect(date.getDate()).toBe(15);
    });

    it('should parse US date format', () => {
      const result = parseScheduleDate('05/15/2026', '14:30');
      expect(result).toBeTruthy();
      const date = new Date(result);
      expect(date.getMonth()).toBe(4); // May
    });

    it('should reject past dates', () => {
      expect(parseScheduleDate('2026-04-08', '09:00')).toBe(null);
    });

    it('should reject dates beyond 6 months', () => {
      expect(parseScheduleDate('2026-11-01', '09:00')).toBe(null);
    });

    it('should handle missing time', () => {
      const result = parseScheduleDate('2026-05-15', '');
      expect(result).toBeTruthy();
      const date = new Date(result);
      expect(date.getHours()).toBe(9); // Default 9:00 AM
    });

    it('should reject invalid formats', () => {
      expect(parseScheduleDate('invalid', '09:00')).toBe(null);
      expect(parseScheduleDate('2026-13-45', '09:00')).toBe(null);
    });
  });
});

describe('ID Generation', () => {
  describe('generateId', () => {
    it('should generate UUIDs', () => {
      const id = generateId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate valid UUID format', () => {
      const id = generateId();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidPattern.test(id)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// COMPONENT TESTS (with React Testing Library)
// ─────────────────────────────────────────────────────────────

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../App';

describe('ErrorBoundary', () => {
  const ProblematicComponent = () => {
    throw new Error('Test error');
  };

  it('should display error message when child component throws', () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('should provide a retry button', () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>
    );
    
    const retryButton = screen.getByRole('button', { name: /try again/i });
    expect(retryButton).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION TESTS (Optimistic Update Rollback)
// ─────────────────────────────────────────────────────────────

describe('Optimistic Update Rollback', () => {
  it('should rollback optimistic update on API failure', async () => {
    // Setup
    const initialPosts = [{ id: '1', content: 'Original' }];
    const updatedPost = { id: '1', content: 'Updated' };
    const mockError = new Error('API failed');
    
    // Mock API failure
    const mockUpdate = jest.fn().mockRejectedValueOnce(mockError);
    
    // Test logic
    let state = initialPosts;
    
    // Optimistic update
    state = [updatedPost];
    
    try {
      // Attempt API call
      await mockUpdate(updatedPost);
    } catch (e) {
      // Rollback on error
      state = initialPosts;
    }
    
    expect(state).toEqual(initialPosts);
  });
});

// ─────────────────────────────────────────────────────────────
// API ERROR CLASSIFICATION TESTS
// ─────────────────────────────────────────────────────────────

import { classifyError } from '../utils-improved';

describe('Error Classification', () => {
  it('should classify network errors', () => {
    const result = classifyError(new Error('Request timed out'));
    expect(result.type).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('should classify auth errors', () => {
    const result = classifyError(new Error('401 Unauthorized'));
    expect(result.type).toBe('auth');
    expect(result.retryable).toBe(false);
  });

  it('should classify rate limit errors', () => {
    const result = classifyError(new Error('429 Too many requests'));
    expect(result.type).toBe('ratelimit');
    expect(result.retryable).toBe(true);
  });

  it('should classify server errors', () => {
    const result = classifyError(new Error('500 Internal Server Error'));
    expect(result.type).toBe('server');
    expect(result.retryable).toBe(true);
  });
});
