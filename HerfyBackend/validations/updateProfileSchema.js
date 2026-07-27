const Joi = require('joi');

// FIX (H8): PUT /users/me previously had no Joi validation at all — the
// controller whitelists which fields can be *set* (preventing mass
// assignment of privileged fields), but applied no format/type checking.
// This mirrors the same phone pattern and location shape used at
// registration, and disallows an empty-string phone (which, combined with
// the H7 sparse-index fix, would otherwise still collide with other users
// who explicitly cleared their phone to "").
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).messages({
    'string.min': 'الاسم يجب أن يكون 2 أحرف',
  }),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).messages({
    'string.pattern.base': 'رقم الهاتف غير صحيح',
  }),
  profileImage: Joi.string().allow('').optional(),
  city: Joi.string().allow(null, '').optional(),
  location: Joi.alternatives().try(
    Joi.array().items(Joi.number()).length(2),
    Joi.object({
      type: Joi.string().valid('Point').default('Point'),
      coordinates: Joi.array().items(Joi.number()).length(2),
    })
  ).optional(),
}).min(1); // at least one field must be present in a profile-update request

module.exports = updateProfileSchema;
