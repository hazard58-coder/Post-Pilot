import * as Sentry from '@sentry/react';

export class APIError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.response = response;
  }
}

export function handleAPIError(error, context = {}) {
  // Classify error type
  let errorType = 'unknown';
  let userMessage = 'An unexpected error occurred';
  let shouldRetry = false;

  if (error.status) {
    switch (error.status) {
      case 400:
        errorType = 'validation';
        userMessage = 'Invalid request. Please check your input.';
        break;
      case 401:
        errorType = 'auth';
        userMessage = 'Authentication required. Please sign in.';
        break;
      case 403:
        errorType = 'permission';
        userMessage = 'You don\'t have permission to perform this action.';
        break;
      case 404:
        errorType = 'not_found';
        userMessage = 'The requested resource was not found.';
        break;
      case 429:
        errorType = 'rate_limit';
        userMessage = 'Too many requests. Please try again later.';
        shouldRetry = true;
        break;
      case 500:
      case 502:
      case 503:
        errorType = 'server';
        userMessage = 'Server error. Please try again later.';
        shouldRetry = true;
        break;
      default:
        errorType = 'http';
        userMessage = `Request failed (${error.status})`;
    }
  } else if (error.name === 'NetworkError') {
    errorType = 'network';
    userMessage = 'Network error. Check your connection.';
    shouldRetry = true;
  }

  // Log to Sentry
  Sentry.captureException(error, {
    tags: {
      error_type: errorType,
      http_status: error.status,
    },
    extra: {
      ...context,
      userMessage,
      shouldRetry,
      response: error.response,
    },
  });

  // Log to console in development
  if (import.meta.env.DEV) {
    console.error('[API Error]', {
      type: errorType,
      status: error.status,
      message: error.message,
      context,
    });
  }

  return {
    type: errorType,
    message: userMessage,
    shouldRetry,
    originalError: error,
  };
}

export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const handled = handleAPIError(error, context);
      throw handled;
    }
  };
}