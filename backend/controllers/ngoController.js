const Donation = require('../models/Donation');
const NgoRequest = require('../models/NgoRequest');
const VolunteerTask = require('../models/VolunteerTask');
const User = require('../models/User');
const { createNotification } = require('../utils/notificationHelper');

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

// @desc    Get nearby available donations
// @route   GET /api/ngo/donations/nearby
// @access  Private (NGO / Admin)
const getNearbyDonations = async (req, res, next) => {
  try {
    const rawDonations = await Donation.find({ status: 'available' })
      .populate('donorId', 'name email phone address organizationName formattedAddress locationName location latitude longitude')
      .sort({ createdAt: -1 });

    const donations = rawDonations.map(resolveDonationImages);

    res.json({
      success: true,
      count: donations.length,
      donations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Accept donation
// @route   POST /api/ngo/donations/:id/accept
// @access  Private (NGO)
const acceptDonation = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }

    // BUSINESS RULE: Only Verified NGOs can accept food donations
    if (req.user.verificationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Only Verified NGOs can accept food donations. Please upload mandatory documents and wait for admin approval.',
      });
    }

    if (donation.status !== 'available') {
      return res.status(400).json({ success: false, message: `Donation is already ${donation.status}` });
    }

    if (!req.body.volunteerId) {
      return res.status(400).json({
        success: false,
        message: 'A volunteer courier must be selected to accept a food donation.',
      });
    }

    donation.status = 'assigned';
    donation.ngoId = req.user._id;
    donation.volunteerId = req.body.volunteerId;
    await donation.save();

    const ngoRequest = await NgoRequest.create({
      donationId: donation._id,
      ngoId: req.user._id,
      status: 'assigned',
    });

    await VolunteerTask.create({
      donationId: donation._id,
      volunteerId: req.body.volunteerId,
      ngoId: req.user._id,
      status: 'assigned',
    });

    // Send role-based real-time notifications to Donor and Volunteer
    if (donation.donorId) {
      await createNotification({
        userId: donation.donorId,
        role: 'donor',
        title: 'Donation Accepted by NGO',
        message: `Great news! Your food donation '${donation.title}' has been accepted by ${req.user.organizationName || req.user.name}.`,
        type: 'success',
        link: '/donor/my-donations',
      });
    }

    if (req.body.volunteerId) {
      await createNotification({
        userId: req.body.volunteerId,
        role: 'volunteer',
        title: 'New Pickup Task Assigned',
        message: `You have been assigned to pick up donation '${donation.title}' for ${req.user.organizationName || req.user.name}.`,
        type: 'urgent',
        link: '/volunteer/assignments',
      });
    }

    res.json({
      success: true,
      message: 'Donation assigned to volunteer successfully',
      donation,
      ngoRequest,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get accepted donation history for NGO
// @route   GET /api/ngo/donations/history
// @access  Private (NGO)
const getDonationHistory = async (req, res, next) => {
  try {
    const rawDonations = await Donation.find({ ngoId: req.user._id })
      .populate('donorId', 'name email phone address organizationName formattedAddress locationName location latitude longitude')
      .populate('volunteerId', 'name email phone address formattedAddress locationName location latitude longitude currentLocation')
      .sort({ updatedAt: -1 });

    const donations = await Promise.all(
      rawDonations.map(async (d) => {
        const obj = resolveDonationImages(d);
        if (!obj.pickupPhoto || obj.pickupPhoto === '[object Object]') {
          const task = await VolunteerTask.findOne({ donationId: d._id });
          if (task && task.pickupPhoto && task.pickupPhoto !== '[object Object]') {
            obj.pickupPhoto = task.pickupPhoto;
          } else if (obj.status === 'picked_up' || obj.status === 'on_the_way' || obj.status === 'delivered') {
            obj.pickupPhoto = obj.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
          }
        }
        return obj;
      })
    );

    res.json({
      success: true,
      count: donations.length,
      donations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get stats for NGO dashboard
// @route   GET /api/ngo/stats
// @access  Private (NGO / Admin)
const getNgoStats = async (req, res, next) => {
  try {
    const ngoId = req.user._id;

    const nearbyCount = await Donation.countDocuments({ status: 'available' });
    const activeDonationsCount = await Donation.countDocuments({
      ngoId,
      status: { $in: ['assigned', 'accepted', 'picked_up', 'on_the_way'] },
    });
    const acceptedDonations = await Donation.find({
      ngoId,
      status: { $in: ['accepted', 'picked_up', 'on_the_way', 'delivered'] },
    });

    const totalMealsReceived = acceptedDonations.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);

    res.json({
      success: true,
      stats: {
        mealsReceived: totalMealsReceived,
        activeDonations: activeDonationsCount,
        nearbyDonations: nearbyCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single donation details
// @route   GET /api/ngo/donations/:id
// @access  Private (NGO / Admin)
const getDonationDetails = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id)
      .populate('donorId', 'name email phone address organizationName formattedAddress locationName location latitude longitude verificationStatus')
      .populate('volunteerId', 'name email phone address formattedAddress locationName location latitude longitude currentLocation')
      .populate('ngoId', 'name email phone address organizationName formattedAddress locationName location latitude longitude');

    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }

    const obj = resolveDonationImages(donation);
    if (!obj.pickupPhoto || obj.pickupPhoto === '[object Object]') {
      const task = await VolunteerTask.findOne({ donationId: donation._id });
      if (task && task.pickupPhoto && task.pickupPhoto !== '[object Object]') {
        obj.pickupPhoto = task.pickupPhoto;
      } else if (obj.status === 'picked_up' || obj.status === 'on_the_way' || obj.status === 'delivered') {
        obj.pickupPhoto = obj.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
      }
    }

    res.json({
      success: true,
      donation: obj,
    });
  } catch (error) {
    next(error);
  }
};

const getAvailableVolunteers = async (req, res, next) => {
  try {
    const rawVolunteers = await User.find({ role: 'volunteer' })
      .select('name email phone address organizationName verificationStatus')
      .sort({ name: 1 });

    const volunteers = await Promise.all(
      rawVolunteers.map(async (v) => {
        const activeTaskCount = await Donation.countDocuments({
          volunteerId: v._id,
          status: { $in: ['assigned', 'accepted', 'picked_up', 'on_the_way'] },
        });
        const obj = v.toObject();
        obj.activeTaskCount = activeTaskCount;
        return obj;
      })
    );

    res.json({ success: true, volunteers });
  } catch (error) {
    next(error);
  }
};

const revertDonationAcceptance = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }

    donation.status = 'available';
    donation.ngoId = null;
    donation.volunteerId = null;
    await donation.save();

    await NgoRequest.deleteMany({ donationId: donation._id });
    await VolunteerTask.deleteMany({ donationId: donation._id });

    res.json({
      success: true,
      message: 'Donation acceptance reverted successfully',
      donation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNgoStats,
  getNearbyDonations,
  getDonationDetails,
  acceptDonation,
  revertDonationAcceptance,
  getDonationHistory,
  getAvailableVolunteers,
};

