const mongoose = require('mongoose');

const volunteerTaskSchema = new mongoose.Schema(
  {
    donationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Donation',
      required: true,
    },
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ngoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'cancelled'],
      default: 'assigned',
    },
    pickupPhoto: {
      type: String,
      default: '',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    pickedUpAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('VolunteerTask', volunteerTaskSchema);
