import express from 'express';
import { upload } from '../middleware/upload.js';
import { uploadImages, uploadSingleImage, deleteImage } from '../controllers/uploadController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.post('/images', protect, authorize('admin'), upload.array('images', 10), uploadImages);
router.post('/single', protect, authorize('admin'), upload.single('image'), uploadSingleImage);
router.delete('/:public_id', protect, authorize('admin'), deleteImage);

export default router;
