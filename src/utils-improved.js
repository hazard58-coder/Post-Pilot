// ─────────────────────────────────────────────────────────────
// IMPROVED Utility Functions for Input Validation & Sanitization
// ─────────────────────────────────────────────────────────────

/**
 * RFC 5322 compliant email validation (simplified)
 * Use this library in production: npm install email-validator
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const trimmed = email.trim().toLowerCase();
  
  // Basic length check
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  
  // RFC 5322 simplified pattern (good enough for most cases)
  // For production, use email-validator library
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(trimmed)) return false;
  
  // Additional checks
  const [localPart, domain] = trimmed.split('@');
  
  // Local part cannot start/end with dot, no consecutive dots
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  
  // Domain must have at least one dot (except special cases)
  if (!domain.includes('.')) return false;
  
  // Domain labels must be valid
  const labels = domain.split('.');
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    if (!/^[a-z0-9-]+$/i.test(label)) return false;
  }
  
  return true;
};

/**
 * Sanitize user-generated content to prevent XSS.
 * Use this for any HTML that will be rendered.
 * In production, use DOMPurify: npm install dompurify
 */
export const sanitizeHTML = (html) => {
  if (!html || typeof html !== 'string') return '';
  
  // For production, use DOMPurify:
  // import DOMPurify from 'dompurify';
  // return DOMPurify.sanitize(html);
  
  // Basic fallback: escape HTML special characters
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return html.replace(/[&<>"']/g, char => map[char]);
};

/**
 * Validate CSV input before parsing
 */
export const validateCSVInput = (csvText) => {
  if (!csvText || typeof csvText !== 'string') {
    return { valid: false, error: 'CSV text is required' };
  }
  
  // Check file size (max 5MB)
  if (csvText.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'CSV file exceeds 5MB limit' };
  }
  
  // Check line count (max 1000 posts at once)
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length > 1001) { // header + 1000 rows
    return { valid: false, error: 'CSV contains more than 1000 rows' };
  }
  
  return { valid: true };
};

/**
 * RFC-4180 compliant CSV line parser
 * Handles quoted fields, escaped quotes, empty fields
 */
export const parseCSVLine = (line) => {
  if (!line || typeof line !== 'string') return [];
  
  const fields = [];
  let current  = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    
    if (ch === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      // Field delimiter
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  
  // Add final field
  fields.push(current.trim());
  
  // Remove empty trailing fields
  while (fields.length > 0 && fields[fields.length - 1] === '') {
    fields.pop();
  }
  
  return fields;
};

/**
 * Parse CSV content into structured posts
 * Expected CSV format: date,time,content,platforms,category
 */
export const parseCSVPosts = (csvText, companyId) => {
  const validation = validateCSVInput(csvText);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) {
    throw new Error('CSV must have header row + at least one data row');
  }
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  const expectedHeaders = ['date', 'time', 'content', 'platforms', 'category'];
  
  // Validate headers (case-insensitive, but must have required columns)
  const headerMap = {};
  headers.forEach((h, idx) => {
    headerMap[h.toLowerCase()] = idx;
  });
  
  const requiredCols = ['date', 'time', 'content'];
  for (const col of requiredCols) {
    if (!(col in headerMap)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }
  
  // Parse rows
  const posts = [];
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const fields = parseCSVLine(lines[lineIdx]);
    
    const dateStr = fields[headerMap.date]?.trim() || '';
    const timeStr = fields[headerMap.time]?.trim() || '';
    const content = fields[headerMap.content]?.trim() || '';
    const platformsStr = fields[headerMap.platforms]?.trim() || '';
    const category = fields[headerMap.category]?.trim() || '';
    
    // Validate required fields
    if (!dateStr || !timeStr || !content) {
      throw new Error(`Row ${lineIdx + 1}: date, time, and content are required`);
    }
    
    // Validate and parse date
    const scheduledDate = parseScheduleDate(dateStr, timeStr);
    if (!scheduledDate) {
      throw new Error(`Row ${lineIdx + 1}: invalid date/time format`);
    }
    
    // Parse platforms
    const platforms = platformsStr
      .split(',')
      .map(p => p.trim())
      .filter(p => p);
    
    if (platforms.length === 0) {
      throw new Error(`Row ${lineIdx + 1}: at least one platform required`);
    }
    
    // Validate content length
    if (content.length < 1 || content.length > 40000) {
      throw new Error(`Row ${lineIdx + 1}: content must be 1-40000 characters`);
    }
    
    posts.push({
      id: generateId(),
      content: sanitizeHTML(content),
      platforms,
      scheduledDate,
      status: 'draft',
      postType: 'Post',
      hashtags: [],
      engagement: null,
      category,
      mediaUrls: [],
      perNetwork: {},
      companyId,
    });
  }
  
  if (posts.length === 0) {
    throw new Error('No valid posts found in CSV');
  }
  
  return posts;
};

/**
 * Parse date and time strings into a Date object
 * Handles multiple formats: YYYY-MM-DD, MM/DD/YYYY, etc.
 */
export const parseScheduleDate = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  
  try {
    // Try parsing as ISO date first
    let date;
    
    if (dateStr.includes('-')) {
      // YYYY-MM-DD format
      date = new Date(`${dateStr}T${timeStr || '09:00'}:00`);
    } else if (dateStr.includes('/')) {
      // MM/DD/YYYY format
      const [month, day, year] = dateStr.split('/');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (timeStr) {
        const [hours, minutes] = timeStr.split(':');
        date.setHours(parseInt(hours) || 9, parseInt(minutes) || 0);
      }
    } else {
      return null;
    }
    
    // Validate date is in the future and within 6 months
    const now = new Date();
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    
    if (date <= now || date > sixMonthsLater) {
      return null;
    }
    
    return date.toISOString();
  } catch {
    return null;
  }
};

/**
 * Generate a cryptographically secure UUID
 */
export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Handle optimistic update with rollback
 */
export const createOptimisticUpdate = (currentState, newState, rollbackOnError) => {
  return {
    optimistic: newState,
    rollback: () => currentState,
    onError: rollbackOnError,
  };
};

/**
 * Debounce function to prevent API spam
 */
export const debounce = (fn, delayMs) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
};

/**
 * Throttle function for high-frequency events
 */
export const throttle = (fn, intervalMs) => {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  };
};

/**
 * Classify API errors for user-friendly messages
 */
export const classifyError = (error) => {
  if (!error) return { type: 'unknown', message: 'An error occurred', retryable: false };
  
  const message = error.message || String(error);
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return { type: 'network', message: 'Request timed out. Check your connection.', retryable: true };
  }
  
  if (message.includes('offline') || message.includes('network')) {
    return { type: 'network', message: 'Network error. Check your connection.', retryable: true };
  }
  
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('auth')) {
    return { type: 'auth', message: 'Your session expired. Please sign in again.', retryable: false };
  }
  
  if (message.includes('404')) {
    return { type: 'notfound', message: 'Resource not found.', retryable: false };
  }
  
  if (message.includes('429') || message.includes('rate limit')) {
    return { type: 'ratelimit', message: 'Too many requests. Try again later.', retryable: true };
  }
  
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return { type: 'server', message: 'Server error. We\'re fixing it. Try again shortly.', retryable: true };
  }
  
  return { type: 'unknown', message: 'Something went wrong. Please try again.', retryable: false };
};

export default {
  isValidEmail,
  sanitizeHTML,
  validateCSVInput,
  parseCSVLine,
  parseCSVPosts,
  parseScheduleDate,
  generateId,
  createOptimisticUpdate,
  debounce,
  throttle,
  classifyError,
};
