/**
 * 記憶備份與還原工具
 * 提供記憶導出、導入和備份功能
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 創建備份與還原工具
 * @param {Function} getShortTermManager - 獲取短期記憶管理器
 * @param {Function} getLongTermManager - 獲取長期記憶管理器
 * @param {Function} getStorageManager - 獲取存儲管理器
 * @returns {Array} 工具定義數組
 */
export function createBackupTools(getShortTermManager, getLongTermManager, getStorageManager) {
  const tools = [];

  // 備份記憶工具
  tools.push({
    name: 'backup_memories',
    description: '將指定對話的所有記憶備份到文件。支持導出短期和長期記憶，包含完整的元數據和時間戳。',
    inputSchema: z.object({
      conversation_id: z.string().describe('對話 ID'),
      output_path: z.string().optional().describe('輸出文件路徑（默認為 data/backups/）'),
      include_short_term: z.boolean().default(true).describe('是否包含短期記憶'),
      include_long_term: z.boolean().default(true).describe('是否包含長期記憶'),
      compress: z.boolean().default(false).describe('是否壓縮（保留用於將來實現）')
    }),
    async handler(args) {
      const { conversation_id, output_path, include_short_term, include_long_term } = args;

      try {
        const storage = getStorageManager(conversation_id);
        const backup = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          conversation_id,
          short_term: null,
          long_term: null
        };

        let totalMemories = 0;

        // 加載短期記憶
        if (include_short_term) {
          const shortTerm = await storage.loadShortTermMemories();
          backup.short_term = shortTerm;
          totalMemories += shortTerm.length;
        }

        // 加載長期記憶
        if (include_long_term) {
          const longTerm = await storage.loadLongTermMemories();
          backup.long_term = longTerm;
          totalMemories += longTerm.length;
        }

        // 確定輸出路徑
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultPath = path.join(__dirname, '../../data/backups');
        const backupDir = output_path || defaultPath;

        await fs.mkdir(backupDir, { recursive: true });

        const fileName = `backup_${conversation_id}_${timestamp}.json`;
        const filePath = path.join(backupDir, fileName);

        // 寫入備份文件
        const content = JSON.stringify(backup, null, 2);
        await fs.writeFile(filePath, content, 'utf-8');

        const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(2);

        return {
          success: true,
          backup_path: filePath,
          total_memories: totalMemories,
          short_term_count: backup.short_term?.length || 0,
          long_term_count: backup.long_term?.length || 0,
          size_kb: sizeKB,
          timestamp: backup.timestamp
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // 還原記憶工具
  tools.push({
    name: 'restore_memories',
    description: '從備份文件還原記憶。警告：這將覆蓋當前對話的所有記憶。',
    inputSchema: z.object({
      conversation_id: z.string().describe('目標對話 ID'),
      backup_path: z.string().describe('備份文件路徑'),
      restore_short_term: z.boolean().default(true).describe('是否還原短期記憶'),
      restore_long_term: z.boolean().default(true).describe('是否還原長期記憶'),
      merge: z.boolean().default(false).describe('是否合併而非覆蓋（保留現有記憶）')
    }),
    async handler(args) {
      const { conversation_id, backup_path, restore_short_term, restore_long_term, merge } = args;

      try {
        // 讀取備份文件
        const content = await fs.readFile(backup_path, 'utf-8');
        const backup = JSON.parse(content);

        // 驗證備份格式
        if (!backup.version || !backup.timestamp) {
          return {
            success: false,
            error: 'Invalid backup file format'
          };
        }

        const storage = getStorageManager(conversation_id);
        let restored = 0;

        // 還原短期記憶
        if (restore_short_term && backup.short_term) {
          if (merge) {
            const existing = await storage.loadShortTermMemories();
            const merged = [...existing, ...backup.short_term];
            await storage.saveShortTermMemories(merged);
            restored += backup.short_term.length;
          } else {
            await storage.saveShortTermMemories(backup.short_term);
            restored += backup.short_term.length;
          }

          // 重新加載管理器
          const manager = await getShortTermManager(conversation_id);
          const memories = await storage.loadShortTermMemories();
          manager.loadMemories(memories);
        }

        // 還原長期記憶
        if (restore_long_term && backup.long_term) {
          if (merge) {
            const existing = await storage.loadLongTermMemories();
            const merged = [...existing, ...backup.long_term];
            await storage.saveLongTermMemories(merged);
            restored += backup.long_term.length;
          } else {
            await storage.saveLongTermMemories(backup.long_term);
            restored += backup.long_term.length;
          }

          // 重新加載管理器
          const manager = await getLongTermManager(conversation_id);
          const memories = await storage.loadLongTermMemories();
          manager.loadMemories(memories);
        }

        return {
          success: true,
          conversation_id,
          restored_memories: restored,
          backup_timestamp: backup.timestamp,
          mode: merge ? 'merge' : 'overwrite'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // 列出備份文件工具
  tools.push({
    name: 'list_backups',
    description: '列出可用的備份文件',
    inputSchema: z.object({
      backup_dir: z.string().optional().describe('備份目錄路徑（默認為 data/backups/）'),
      conversation_id: z.string().optional().describe('過濾特定對話 ID 的備份')
    }),
    async handler(args) {
      const { backup_dir, conversation_id } = args;

      try {
        const defaultPath = path.join(__dirname, '../../data/backups');
        const backupPath = backup_dir || defaultPath;

        // 確保目錄存在
        await fs.mkdir(backupPath, { recursive: true });

        // 讀取目錄
        const files = await fs.readdir(backupPath);
        const backups = [];

        for (const file of files) {
          if (!file.endsWith('.json')) continue;

          // 過濾對話 ID
          if (conversation_id && !file.includes(conversation_id)) {
            continue;
          }

          const filePath = path.join(backupPath, file);
          const stats = await fs.stat(filePath);

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const backup = JSON.parse(content);

            backups.push({
              file_name: file,
              file_path: filePath,
              conversation_id: backup.conversation_id,
              timestamp: backup.timestamp,
              size_kb: (stats.size / 1024).toFixed(2),
              short_term_count: backup.short_term?.length || 0,
              long_term_count: backup.long_term?.length || 0
            });
          } catch (error) {
            // 跳過無法解析的文件
            continue;
          }
        }

        // 按時間戳排序（最新的在前）
        backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return {
          success: true,
          total: backups.length,
          backups
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // 刪除備份文件工具
  tools.push({
    name: 'delete_backup',
    description: '刪除指定的備份文件',
    inputSchema: z.object({
      backup_path: z.string().describe('備份文件路徑')
    }),
    async handler(args) {
      const { backup_path } = args;

      try {
        // 確保文件存在
        await fs.access(backup_path);

        // 刪除文件
        await fs.unlink(backup_path);

        return {
          success: true,
          deleted_file: backup_path
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  return tools;
}

export default createBackupTools;
