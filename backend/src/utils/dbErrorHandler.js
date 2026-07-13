'use strict';

const Sentry = require('@sentry/node');

/**
 * trackMongoOperation — wrapper for MongoDB operations to track errors
 * and slow queries in Sentry.
 *
 * @param {Function} operation     - async function performing the DB work
 * @param {string}   operationName - descriptive name, e.g. 'find_voter_by_epic'
 * @param {Object}   [context]     - extra context, e.g. { epicNo, mobile }
 * @returns {Promise<*>} result of the operation
 */
async function trackMongoOperation(operation, operationName, context = {}) {
  const startTime = Date.now();

  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    // Flag slow queries (>2s) as a warning
    if (duration > 2000) {
      Sentry.captureMessage('Slow MongoDB query detected', {
        level: 'warning',
        tags:  { operation: 'mongodb_query', query_type: operationName, performance: 'slow' },
        extra: { ...context, durationMs: duration },
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    Sentry.captureException(error, {
      tags:  { operation: 'mongodb_query', query_type: operationName, database: 'mongodb' },
      extra: {
        ...context,
        durationMs:   duration,
        errorMessage: error.message,
        errorCode:    error.code,
      },
    });

    throw error;
  }
}

module.exports = { trackMongoOperation };
