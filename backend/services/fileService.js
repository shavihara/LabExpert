const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const { db, prepare } = require('../config/database');

class FileService {
  static async ensureUserDirectories(userId) {
    const userDir = path.join(__dirname, '../uploads/users', userId);
    const profileDir = path.join(userDir, 'profile');
    const documentsDir = path.join(userDir, 'documents');
    for (const dir of [userDir, profileDir, documentsDir]) await fs.mkdir(dir, { recursive: true });
    return { userDir, profileDir, documentsDir };
  }

  static async saveProfilePicture(file, userId) {
    const { profileDir } = await this.ensureUserDirectories(userId);
    const stmt = prepare('SELECT * FROM files WHERE user_id = @userId AND file_type = \'profile_picture\' AND is_active = 1');
    const existingPic = stmt.get({ userId });
    if (existingPic) await this.deleteFile(existingPic.id);
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    const filename = `profile-${Date.now()}${ext}`;
    const filePath = path.join(profileDir, filename);
    await fs.writeFile(filePath, file.buffer);
    const insertStmt = prepare(
      'INSERT INTO files (id, user_id, file_type, original_name, filename, file_path, mimetype, size) VALUES (@id, @userId, @fileType, @originalName, @filename, @filePath, @mimetype, @size)'
    );
    insertStmt.run({ id, userId, fileType: 'profile_picture', originalName: file.originalname, filename, filePath, mimetype: file.mimetype, size: file.size });
    return { id, filename, filePath };
  }

  static async saveDocument(file, userId, metadata = {}) {
    const { documentsDir } = await this.ensureUserDirectories(userId);
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    const filename = `${id}${ext}`;
    const filePath = path.join(documentsDir, filename);
    await fs.writeFile(filePath, file.buffer);
    const insertStmt = prepare(
      'INSERT INTO files (id, user_id, file_type, original_name, filename, file_path, mimetype, size, metadata) VALUES (@id, @userId, @fileType, @originalName, @filename, @filePath, @mimetype, @size, @metadata)'
    );
    insertStmt.run({ id, userId, fileType: 'document', originalName: file.originalname, filename, filePath, mimetype: file.mimetype, size: file.size, metadata: JSON.stringify(metadata) });
    return { id, filename, originalName: file.originalname };
  }

  static async getFile(fileId) {
    const stmt = prepare('SELECT * FROM files WHERE id = @id AND is_active = 1');
    const file = stmt.get({ id: fileId });
    if (file && file.metadata) try { file.metadata = JSON.parse(file.metadata); } catch (e) { file.metadata = {}; }
    return file;
  }

  static async getFileData(fileId) {
    const file = await this.getFile(fileId);
    if (!file) throw new Error('File not found');
    const data = await fs.readFile(file.file_path);
    return { data, file };
  }

  static async deleteFile(fileId) {
    const file = await this.getFile(fileId);
    if (!file) throw new Error('File not found');
    try { await fs.unlink(file.file_path); } catch (error) { console.error('Error deleting physical file:', error); }
    const stmt = prepare('UPDATE files SET is_active = 0 WHERE id = @id');
    stmt.run({ id: fileId });
  }

  static async getUserFiles(userId, fileType = null) {
    let sql = 'SELECT id, file_type, original_name, filename, mimetype, size, created_at FROM files WHERE user_id = @userId AND is_active = 1';
    const params = { userId };
    if (fileType) { sql += ' AND file_type = @fileType'; params.fileType = fileType; }
    sql += ' ORDER BY created_at DESC';
    const stmt = prepare(sql);
    return stmt.all(params);
  }

  static async cleanupOrphanedFiles() {}
}

module.exports = FileService;