import DOMPurify from 'dompurify';

// Content Security Policy violation reporting
export function initCSPReporting() {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.error('CSP Violation:', {
      violatedDirective: e.violatedDirective,
      blockedURI: e.blockedURI,
      sourceFile: e.sourceFile,
      lineNumber: e.lineNumber,
    });

    // Send to monitoring
    if (window.gtag) {
      window.gtag('event', 'csp_violation', {
        violated_directive: e.violatedDirective,
        blocked_uri: e.blockedURI,
      });
    }
  });
}

// Sanitize HTML content
export function sanitizeHTML(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a'],
    ALLOWED_ATTR: ['href', 'target'],
    ALLOW_DATA_ATTR: false,
  });
}

// Validate and sanitize user input
export function sanitizeInput(input, options = {}) {
  if (typeof input !== 'string') return '';

  let sanitized = input.trim();

  // Length limits
  if (options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength);
  }

  // Pattern validation
  if (options.pattern && !options.pattern.test(sanitized)) {
    throw new Error('Input does not match required pattern');
  }

  // HTML sanitization if needed
  if (options.allowHTML) {
    sanitized = sanitizeHTML(sanitized);
  } else {
    // Escape HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  return sanitized;
}

// Rate limiting for client-side actions
export class ClientRateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }
}

export const apiRateLimiter = new ClientRateLimiter(50, 60000); // 50 requests per minute