import { z } from 'zod';

const { ZodFirstPartyTypeKind } = z;

function applyMetadata(schema, zodType) {
  if (zodType.description && !schema.description) {
    schema.description = zodType.description;
  }
  if (typeof zodType._def?.defaultValue === 'function') {
    try {
      schema.default = zodType._def.defaultValue();
    } catch (error) {
      // ignore default evaluation errors
    }
  }
  return schema;
}

function mergeTypeWithNull(typeSchema) {
  if (!typeSchema) return typeSchema;
  if ('anyOf' in typeSchema) {
    typeSchema.anyOf = [...typeSchema.anyOf, { type: 'null' }];
    return typeSchema;
  }
  if (typeSchema.type === undefined) {
    typeSchema.type = ['null'];
    return typeSchema;
  }
  if (Array.isArray(typeSchema.type)) {
    if (!typeSchema.type.includes('null')) {
      typeSchema.type = [...typeSchema.type, 'null'];
    }
  } else if (typeSchema.type !== 'null') {
    typeSchema.type = [typeSchema.type, 'null'];
  }
  return typeSchema;
}

function unwrapEffects(schema) {
  let current = schema;
  while (current && current._def?.typeName === ZodFirstPartyTypeKind.ZodEffects) {
    current = current._def.schema;
  }
  return current || schema;
}

export function zodToJsonSchema(zodType) {
  if (!zodType || typeof zodType !== 'object') {
    return {};
  }

  const normalized = unwrapEffects(zodType);
  const def = normalized._def;

  let schema;

  switch (def.typeName) {
    case ZodFirstPartyTypeKind.ZodString: {
      schema = { type: 'string' };
      break;
    }
    case ZodFirstPartyTypeKind.ZodNumber: {
      const isInt = def.checks?.some(check => check.kind === 'int');
      schema = { type: isInt ? 'integer' : 'number' };
      break;
    }
    case ZodFirstPartyTypeKind.ZodBoolean: {
      schema = { type: 'boolean' };
      break;
    }
    case ZodFirstPartyTypeKind.ZodLiteral: {
      schema = { const: def.value };
      const valueType = typeof def.value;
      if (['string', 'number', 'boolean'].includes(valueType)) {
        schema.type = valueType;
      }
      break;
    }
    case ZodFirstPartyTypeKind.ZodEnum: {
      schema = { type: 'string', enum: [...def.values] };
      break;
    }
    case ZodFirstPartyTypeKind.ZodObject: {
      const shape = def.shape();
      const properties = {};
      const required = [];

      for (const [key, child] of Object.entries(shape)) {
        const childSchema = zodToJsonSchema(child);
        if (Object.keys(childSchema).length === 0) {
          continue;
        }
        properties[key] = childSchema;
        if (!child.isOptional()) {
          required.push(key);
        }
      }

      schema = {
        type: 'object',
        properties,
      };

      if (required.length > 0) {
        schema.required = required;
      }

      if (def.catchall && def.catchall._def?.typeName !== ZodFirstPartyTypeKind.ZodNever) {
        schema.additionalProperties = zodToJsonSchema(def.catchall);
      } else if (def.unknownKeys === 'passthrough') {
        schema.additionalProperties = true;
      } else {
        schema.additionalProperties = false;
      }
      break;
    }
    case ZodFirstPartyTypeKind.ZodArray: {
      const itemSchema = zodToJsonSchema(def.type);
      schema = {
        type: 'array',
        items: Object.keys(itemSchema).length > 0 ? itemSchema : {},
      };
      if (typeof def.minLength === 'number') {
        schema.minItems = def.minLength;
      }
      if (typeof def.maxLength === 'number') {
        schema.maxItems = def.maxLength;
      }
      break;
    }
    case ZodFirstPartyTypeKind.ZodUnion: {
      schema = {
        anyOf: def.options.map(option => zodToJsonSchema(option))
      };
      break;
    }
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
      schema = {
        oneOf: def.options.map(option => zodToJsonSchema(option))
      };
      break;
    }
    case ZodFirstPartyTypeKind.ZodOptional: {
      schema = zodToJsonSchema(def.innerType);
      break;
    }
    case ZodFirstPartyTypeKind.ZodNullable: {
      schema = mergeTypeWithNull(zodToJsonSchema(def.innerType));
      break;
    }
    case ZodFirstPartyTypeKind.ZodDefault: {
      schema = zodToJsonSchema(def.innerType);
      if (typeof def.defaultValue === 'function') {
        try {
          schema.default = def.defaultValue();
        } catch (error) {
          // ignore default evaluation errors
        }
      }
      break;
    }
    case ZodFirstPartyTypeKind.ZodRecord: {
      schema = {
        type: 'object',
        additionalProperties: zodToJsonSchema(def.valueType)
      };
      break;
    }
    case ZodFirstPartyTypeKind.ZodAny: {
      schema = {};
      break;
    }
    case ZodFirstPartyTypeKind.ZodUnknown: {
      schema = {};
      break;
    }
    case ZodFirstPartyTypeKind.ZodNever: {
      schema = { not: {} };
      break;
    }
    default: {
      schema = {};
      break;
    }
  }

  if (!schema) {
    schema = {};
  }

  applyMetadata(schema, normalized);

  return schema;
}

export default zodToJsonSchema;
