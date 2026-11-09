import { processUploadedFile } from '../middleware/upload.js';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

// @desc    Upload multiple images (Cloudinary or local fallback)
// @route   POST /api/upload/images
// @access  Private (Admin)
export const uploadImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided for upload',
      });
    }

    const uploadedResults = await Promise.all(
      req.files.map((file) => processUploadedFile(file, req))
    );

    res.status(200).json({
      success: true,
      message: `${uploadedResults.length} image(s) processed successfully`,
      storage: isCloudinaryConfigured ? 'cloudinary' : 'local',
      images: uploadedResults,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload single image
// @route   POST /api/upload/single
// @access  Private (Admin)
export const uploadSingleImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    const result = await processUploadedFile(req.file, req);

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      storage: isCloudinaryConfigured ? 'cloudinary' : 'local',
      image: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete image from Cloudinary
// @route   DELETE /api/upload/:public_id
// @access  Private (Admin)
export const deleteImage = async (req, res, next) => {
  try {
    const { public_id } = req.params;

    if (!public_id) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required',
      });
    }

    if (isCloudinaryConfigured && !public_id.startsWith('local_')) {
      await cloudinary.uploader.destroy(public_id);
    }

    res.status(200).json({
      success: true,
      message: 'Image removed successfully',
    });
  } catch (error) {
    next(error);
  }
};
