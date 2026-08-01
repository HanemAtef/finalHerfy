// HerfyBackend/validations/updateProfileSchema.js
const Joi = require("joi");

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  
  phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/).optional(),
  
  profileImage: Joi.string().optional(),
  
  location: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2)
  }).optional(),
  
  city: Joi.string().optional()
});

module.exports = updateProfileSchema;