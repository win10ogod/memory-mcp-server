/**
 * Utilities for working with multimodal memory payloads.
 */

/**
 * Clone a plain JS value (object/array/primitive) while filtering out
 * unsupported values like functions. Dates are converted to ISO strings.
 * @param {*} value
 * @returns {*|undefined}
 */
function clonePlainValue(value) {
  if (Array.isArray(value)) {
    const clonedArray = [];
    for (const item of value) {
      const clonedItem = clonePlainValue(item);
      if (clonedItem !== undefined) {
        clonedArray.push(clonedItem);
      }
    }
    return clonedArray;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    const clonedObject = {};
    for (const [key, val] of Object.entries(value)) {
      const clonedVal = clonePlainValue(val);
      if (clonedVal !== undefined) {
        clonedObject[key] = clonedVal;
      }
    }
    return clonedObject;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  return undefined;
}

/**
 * Normalize a list of modality/attachment descriptors.
 * Ensures objects only contain serializable data and the expected shape.
 *
 * @param {Array} modalitiesInput
 * @returns {Array}
 */
export function normalizeModalities(modalitiesInput) {
  if (!Array.isArray(modalitiesInput)) {
    return [];
  }

  const normalized = [];

  modalitiesInput.forEach(item => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const modality = {};
    const rawType = typeof item.type === 'string' ? item.type.trim() : '';
    modality.type = rawType || 'unknown';

    if (typeof item.uri === 'string' && item.uri.trim()) {
      modality.uri = item.uri.trim();
    }

    if (typeof item.transcript === 'string') {
      modality.transcript = item.transcript;
    }

    if (item.features && typeof item.features === 'object') {
      const features = clonePlainValue(item.features);
      if (features !== undefined) {
        modality.features = features;
      }
    }

    if (item.metadata && typeof item.metadata === 'object') {
      const metadata = clonePlainValue(item.metadata);
      if (metadata !== undefined) {
        modality.metadata = metadata;
      }
    }

    for (const [key, value] of Object.entries(item)) {
      if (['type', 'uri', 'transcript', 'features', 'metadata'].includes(key)) {
        continue;
      }
      if (key.startsWith('_')) {
        continue;
      }
      const clonedValue = clonePlainValue(value);
      if (clonedValue !== undefined) {
        modality[key] = clonedValue;
      }
    }

    normalized.push(modality);
  });

  return normalized;
}

/**
 * Prepare modalities for storage by normalizing and removing temporary keys.
 * @param {Array} modalitiesInput
 * @returns {Array}
 */
export function prepareModalitiesForStorage(modalitiesInput) {
  const normalized = normalizeModalities(modalitiesInput);
  return normalized.map(modality => {
    const prepared = { ...modality };
    for (const key of Object.keys(prepared)) {
      if (key.startsWith('_')) {
        delete prepared[key];
      }
    }
    return prepared;
  });
}

export default {
  normalizeModalities,
  prepareModalitiesForStorage
};
