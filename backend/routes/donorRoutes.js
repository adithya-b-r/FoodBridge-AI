const express = require('express');
const router = express.Router();
const {
  createDonation,
  uploadFoodImage,
  updateDonation,
  deleteDonation,
  getMyDonations,
  getAIPredictions,
} = require('../controllers/donorController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { handleUploadSingle } = require('../middleware/uploadMiddleware');

const { updateTaskStatus } = require('../controllers/volunteerController');

router.post('/', protect, authorizeRoles('donor', 'admin'), createDonation);
router.post('/upload-image', protect, authorizeRoles('donor', 'admin'), handleUploadSingle('image'), uploadFoodImage);
router.get('/my', protect, authorizeRoles('donor', 'admin'), getMyDonations);
router.get('/ai-predictions', protect, authorizeRoles('donor', 'admin'), getAIPredictions);
router.put('/:id', protect, authorizeRoles('donor', 'admin'), updateDonation);
router.delete('/:id', protect, authorizeRoles('donor', 'admin'), deleteDonation);
router.patch('/:id/status', protect, updateTaskStatus);
router.put('/:id/status', protect, updateTaskStatus);

module.exports = router;
