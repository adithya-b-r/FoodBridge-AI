const VolunteerTask = require('../models/VolunteerTask');
const Donation = require('../models/Donation');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const VolunteerLocation = require('../models/VolunteerLocation');
const { uploadToCloudinary } = require('../config/cloudinary');
const { createNotification, notifyAdmins } = require('../utils/notificationHelper');

// @desc    Get volunteer stats from MongoDB
// @route   GET /api/volunteer/stats
// @access  Private (Volunteer)
const getVolunteerStats = async (req, res, next) => {
  try {
    const totalDeliveries = await Donation.countDocuments({
      $or: [{ volunteerId: req.user._id }, { status: 'delivered' }],
      status: 'delivered',
    });

    const activeTasks = await Donation.countDocuments({
      status: { $in: ['accepted', 'picked_up', 'on_the_way'] },
    });

    const feedbacks = await Feedback.find({ volunteerId: req.user._id });
    let totalScore = 0;
    let count = 0;
    feedbacks.forEach((f) => {
      if (f.volunteerRatings && f.volunteerRatings.overall) {
        totalScore += f.volunteerRatings.overall;
        count++;
      }
    });

    const rating = count > 0 ? (totalScore / count).toFixed(1) : '4.9';

    res.json({
      success: true,
      stats: {
        totalDeliveries,
        activeTasks,
        todayPickups: activeTasks,
        rating,
      },
    });
  } catch (error) {
    next(error);
  }
};

const resolveDonationImages = (d) => {
  if (!d) return d;
  const obj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
  const titleLower = (obj.title || '').toLowerCase();

  let validImgs = Array.isArray(obj.images)
    ? obj.images.filter((img) => img && typeof img === 'string' && img.trim() !== '' && !img.startsWith('blob:'))
    : [];

  if (obj.image && typeof obj.image === 'string' && obj.image.trim() !== '' && !obj.image.startsWith('blob:')) {
    if (!validImgs.includes(obj.image)) validImgs.unshift(obj.image);
  }

  if (validImgs.length === 0) {
    if (titleLower.includes('pizza') && titleLower.includes('sandwich')) {
      validImgs = [
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80',
      ];
    } else if (titleLower.includes('pizza')) {
      validImgs = ['https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80'];
    } else if (titleLower.includes('sandwich')) {
      validImgs = ['https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80'];
    } else {
      validImgs = ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80'];
    }
  }

  obj.image = validImgs[0];
  obj.images = validImgs;
  return obj;
};

// @desc    Get assigned volunteer tasks from MongoDB
// @route   GET /api/volunteer/tasks
// @access  Private (Volunteer)
const getAssignedTasks = async (req, res, next) => {
  try {
    const tasks = await VolunteerTask.find({ volunteerId: req.user._id })
      .populate({
        path: 'donationId',
        populate: { path: 'donorId', select: 'name email phone address organizationName formattedAddress locationName location latitude longitude' },
      })
      .populate('ngoId', 'name email phone address organizationName formattedAddress locationName location latitude longitude')
      .sort({ createdAt: -1 });

    const rawActiveDonations = await Donation.find({
      status: { $in: ['accepted', 'picked_up', 'on_the_way'] },
    })
      .populate('donorId', 'name email phone address organizationName formattedAddress locationName location latitude longitude')
      .populate('ngoId', 'name email phone address organizationName formattedAddress locationName location latitude longitude')
      .sort({ updatedAt: -1 });

    const activeDonations = rawActiveDonations.map(resolveDonationImages);

    res.json({
      success: true,
      count: tasks.length || activeDonations.length,
      tasks,
      donations: activeDonations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload pickup verification photo
// @route   POST /api/volunteer/tasks/:id/pickup-verification
// @access  Private (Volunteer)
const uploadPickupVerification = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please upload a pickup photo' });
    }

    let task = await VolunteerTask.findById(req.params.id);
    let donationId = task ? task.donationId : req.params.id;

    const uploadedObj = await uploadToCloudinary(req.file, 'foodbridge_pickups');
    const pickupPhoto = typeof uploadedObj === 'string'
      ? uploadedObj
      : (uploadedObj.secure_url || uploadedObj.url || uploadedObj.toString());

    if (task) {
      task.pickupPhoto = pickupPhoto;
      task.status = 'picked_up';
      task.pickedUpAt = new Date();
      await task.save();
    } else {
      const donationObj = await Donation.findById(req.params.id);
      if (donationObj) {
        task = await VolunteerTask.findOne({ donationId: donationObj._id });
        if (task) {
          task.pickupPhoto = pickupPhoto;
          task.status = 'picked_up';
          task.pickedUpAt = new Date();
          await task.save();
        }
      }
    }

    const updatedDonation = await Donation.findByIdAndUpdate(
      donationId,
      { status: 'picked_up', pickupPhoto: pickupPhoto },
      { new: true }
    );

    // Notify Donor, NGO, and Admins about pickup photo verification
    if (updatedDonation) {
      if (updatedDonation.donorId) {
        await createNotification({
          userId: updatedDonation.donorId,
          role: 'donor',
          title: 'Donation Picked Up',
          message: `Volunteer ${req.user.name || 'Courier'} has picked up your donation '${updatedDonation.title}'.`,
          type: 'info',
          link: '/donor/my-donations',
        });
      }
      if (updatedDonation.ngoId) {
        await createNotification({
          userId: updatedDonation.ngoId,
          role: 'ngo',
          title: 'Food En Route',
          message: `Volunteer ${req.user.name || 'Courier'} picked up '${updatedDonation.title}' and is en route.`,
          type: 'info',
          link: '/ngo/track-volunteer',
        });
      }
      await notifyAdmins({
        title: 'Pickup Photo Uploaded for Review',
        message: `Volunteer ${req.user.name || 'Courier'} uploaded a pickup photo for '${updatedDonation.title}'.`,
        type: 'info',
        link: '/admin/donations',
      });
    }

    res.json({
      success: true,
      message: 'Pickup verification uploaded successfully',
      pickupPhoto,
      task,
      donation: updatedDonation,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update delivery status
// @route   PATCH /api/volunteer/tasks/:id/status
// @access  Private (Volunteer)
const updateTaskStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    let task = await VolunteerTask.findById(req.params.id);

    if (!task) {
      const donation = await Donation.findById(req.params.id);
      if (donation) {
        task = await VolunteerTask.findOne({ donationId: donation._id });
        if (!task) {
          task = new VolunteerTask({
            donationId: donation._id,
            volunteerId: req.user._id,
            ngoId: donation.ngoId || null,
            status: status || 'assigned',
          });
        }
      }
    }

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task or donation not found' });
    }

    task.status = status;
    if (status === 'picked_up' && !task.pickedUpAt) {
      task.pickedUpAt = new Date();
    }
    if (status === 'delivered') {
      task.deliveredAt = new Date();
    }

    await task.save();
    
    const donationUpdate = { status, volunteerId: req.user._id };
    if (task.pickupPhoto) {
      donationUpdate.pickupPhoto = task.pickupPhoto;
    }
    const updatedDonation = await Donation.findByIdAndUpdate(task.donationId, donationUpdate, { new: true });

    if (updatedDonation && status === 'on_the_way') {
      if (updatedDonation.ngoId) {
        await createNotification({
          userId: updatedDonation.ngoId,
          role: 'ngo',
          title: 'Food Donation En Route',
          message: `Volunteer ${req.user.name || 'Courier'} is now on the way with donation '${updatedDonation.title}'.`,
          type: 'info',
          link: '/ngo/track-volunteer',
        });
      }
    }

    // Send notifications when delivery status is updated
    if (updatedDonation && status === 'delivered') {
      if (updatedDonation.donorId) {
        await createNotification({
          userId: updatedDonation.donorId,
          role: 'donor',
          title: 'Donation Delivered Successfully',
          message: `Your food donation '${updatedDonation.title}' was successfully delivered! Thank you for eliminating waste.`,
          type: 'success',
          link: '/donor/my-donations',
        });
      }
      if (updatedDonation.ngoId) {
        await createNotification({
          userId: updatedDonation.ngoId,
          role: 'ngo',
          title: 'Food Donation Delivered',
          message: `Donation '${updatedDonation.title}' has been delivered to your location by volunteer ${req.user.name || 'Courier'}.`,
          type: 'success',
          link: '/ngo/food-details',
        });
      }
    }

    res.json({
      success: true,
      message: `Task status updated to ${status}`,
      task,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get delivery history from MongoDB
// @route   GET /api/volunteer/history
// @access  Private (Volunteer)
const getDeliveryHistory = async (req, res, next) => {
  try {
    const tasks = await VolunteerTask.find({
      volunteerId: req.user._id,
      status: { $in: ['delivered', 'cancelled'] },
    })
      .populate('donationId')
      .populate('ngoId', 'name organizationName')
      .sort({ updatedAt: -1 });

    const deliveredDonations = await Donation.find({
      status: 'delivered',
    })
      .populate('donorId', 'name organizationName')
      .populate('ngoId', 'name organizationName')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: tasks.length || deliveredDonations.length,
      tasks,
      donations: deliveredDonations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update volunteer live GPS location
// @route   POST /api/volunteer/location
// @access  Private (Volunteer)
const updateVolunteerLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, accuracy, heading, speed } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const acc = Number(accuracy) || 0;
    const head = heading !== undefined && heading !== null ? Number(heading) : null;
    const spd = speed !== undefined && speed !== null ? Number(speed) : null;
    const now = new Date();

    // Upsert VolunteerLocation document
    const locationDoc = await VolunteerLocation.findOneAndUpdate(
      { volunteerId: req.user._id },
      {
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        heading: head,
        speed: spd,
        updatedAt: now,
      },
      { new: true, upsert: true }
    );

    // Update User currentLocation sub-document
    await User.findByIdAndUpdate(req.user._id, {
      currentLocation: {
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        heading: head,
        speed: spd,
        updatedAt: now,
      },
      location: { lat, lng },
    });

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: locationDoc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get latest live location of a volunteer
// @route   GET /api/volunteer/location/:volunteerId
// @access  Private (NGO / Volunteer / Admin)
const getVolunteerLocation = async (req, res, next) => {
  try {
    const { volunteerId } = req.params;
    let locationDoc = await VolunteerLocation.findOne({ volunteerId });

    if (!locationDoc) {
      const userDoc = await User.findById(volunteerId);
      if (userDoc && userDoc.currentLocation && userDoc.currentLocation.latitude) {
        locationDoc = {
          volunteerId,
          latitude: userDoc.currentLocation.latitude,
          longitude: userDoc.currentLocation.longitude,
          accuracy: userDoc.currentLocation.accuracy || 0,
          heading: userDoc.currentLocation.heading || null,
          speed: userDoc.currentLocation.speed || null,
          updatedAt: userDoc.currentLocation.updatedAt || userDoc.updatedAt,
        };
      }
    }

    if (!locationDoc) {
      return res.status(404).json({ success: false, message: 'No live location found for this volunteer' });
    }

    res.json({
      success: true,
      location: locationDoc,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVolunteerStats,
  getAssignedTasks,
  uploadPickupVerification,
  updateTaskStatus,
  getDeliveryHistory,
  updateVolunteerLocation,
  getVolunteerLocation,
};
