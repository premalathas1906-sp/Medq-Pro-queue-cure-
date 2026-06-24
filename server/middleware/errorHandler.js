const errorHandler = (err, req, res, next) => {
  console.error('[Global Error Handler]:', err.stack || err.message || err);

  const status = err.status || 500;
  const message = err.message || 'An unexpected error occurred on the server.';

  res.status(status).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    details: err.details || null
  });
};

module.exports = errorHandler;
