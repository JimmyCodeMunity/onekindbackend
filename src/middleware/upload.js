import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

// Only set up local disk storage if Cloudinary is not configured
let uploadDir = null;

if (!isCloudinaryConfigured) {
  // Try to create a writable uploads directory; fall back to memory storage if it fails
  const candidateDir = path.resolve(process.cwd(), 'uploads');
  try {
    if (!fs.existsSync(candidateDir)) {
      fs.mkdirSync(candidateDir, { recursive: true });
    }
    uploadDir = candidateDir;
  } catch (err) {
    console.warn(
      `Could not create uploads directory at ${candidateDir}: ${err.message}. Falling back to memory storage.`
    );
  }
}

// Storage: disk (local fallback only) or memory
const storage =
  uploadDir
    ? multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `img-${uniqueSuffix}${ext}`);
        },
      })
    : multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP, GIF) are allowed'), false);
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per image
  },
  fileFilter,
});

/**
 * Helper to upload a file to Cloudinary if configured, or return local public URL.
 * Handles both disk-stored files (file.path) and memory-stored files (file.buffer).
 */
export const processUploadedFile = async (file, req) => {
  if (isCloudinaryConfigured) {
    try {
      // Support both disk storage (file.path) and memory storage (file.buffer)
      const uploadSource = file.path
        ? file.path
        : `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const result = await cloudinary.uploader.upload(uploadSource, {
        folder: 'onekindact/campaigns',
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });

      // Remove temporary local file after uploading to Cloudinary (disk storage only)
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return {
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        storage: 'cloudinary',
      };
    } catch (err) {
      console.error('Cloudinary upload error:', err.message);
      throw err;
    }
  }

  // Local disk fallback (only reachable when uploadDir was successfully created)
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return {
    url: `${baseUrl}/uploads/${file.filename}`,
    public_id: `local_${file.filename}`,
    storage: 'local',
  };
};
