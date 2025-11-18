/**
 * 圖像記憶相關工具
 * 提供便捷的圖像記憶管理功能
 */

import { z } from 'zod';
import { createImageModality, validateImageModality } from '../utils/image-processor.js';

/**
 * 創建圖像記憶工具
 */
export function createImageMemoryTools() {
  return [
    {
      name: 'create_image_modality',
      description: 'Create an image modality object for use with memories. Supports image URLs, data URIs, and optional embeddings/tags.',
      inputSchema: z.object({
        uri: z.string().describe('Image URI (URL or data:image/... base64)'),
        embedding: z.array(z.number()).optional().describe('Optional image embedding vector for similarity search'),
        tags: z.array(z.string()).optional().describe('Optional tags/keywords for the image'),
        description: z.string().optional().describe('Optional text description of the image'),
        metadata: z.record(z.any()).optional().describe('Optional metadata (size, dimensions, etc.)')
      }),
      handler: async (args) => {
        try {
          const modality = createImageModality(args);
          const validation = validateImageModality(modality);

          if (!validation.valid) {
            return {
              success: false,
              error: validation.errors.join(', ')
            };
          }

          return {
            success: true,
            modality,
            message: 'Image modality created successfully. Use this object in the modalities/attachments field when creating memories.'
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    },
    {
      name: 'validate_image_modality',
      description: 'Validate an image modality object structure',
      inputSchema: z.object({
        modality: z.any().describe('The image modality object to validate')
      }),
      handler: async (args) => {
        try {
          const validation = validateImageModality(args.modality);

          return {
            valid: validation.valid,
            errors: validation.errors,
            message: validation.valid
              ? 'Image modality is valid'
              : `Validation failed: ${validation.errors.join(', ')}`
          };
        } catch (error) {
          return {
            valid: false,
            errors: [error.message],
            message: `Validation error: ${error.message}`
          };
        }
      }
    }
  ];
}

export default createImageMemoryTools;
