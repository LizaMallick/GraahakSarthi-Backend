const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure destination upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurable file size limit (default 10MB)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE_BYTES, 10) || 10 * 1024 * 1024;

// Allowed MIME types: PDF, PNG, JPG/JPEG
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

// Disk storage engine with collision-resistant naming
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `evidence-${uniqueSuffix}${ext}`);
  },
});

// File filter restricting to permitted document types
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeValid = ALLOWED_MIME_TYPES.has(file.mimetype);
  const isExtValid = ALLOWED_EXTENSIONS.has(ext);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only PDF, PNG, and JPG/JPEG files are accepted as case evidence.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// Multer upload middleware instance
const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSize,
  },
  fileFilter,
});

module.exports = upload;
