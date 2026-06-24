const { validationResult } = require('express-validator');

// Helper middleware to check express-validator results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Return structured validation errors
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array().map(err => ({ 
        field: err.path || err.param, 
        message: err.msg 
      }))
    });
  }
  next();
};

module.exports = {
  validate
};
