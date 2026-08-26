// HerfyBackend/validations/updateProfileSchema.js
const Joi = require("joi");

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  
  phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/).optional(),
  
  profileImage: Joi.string().optional().allow("", null),
  
  address: Joi.string().max(300).optional().allow("", null),
  
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array()
      .ordered(
        Joi.number().min(-180).max(180).required(), // longitude
        Joi.number().min(-90).max(90).required()    // latitude
      )
      .length(2)
      .required(),
    address: Joi.string().optional().allow("", null),
  }).optional().allow(null),
});

module.exports = updateProfileSchema;