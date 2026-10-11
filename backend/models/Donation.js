const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Donation title is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    foodType: {
      type: String,
      enum: ['cooked', 'raw', 'packaged', 'bakery', 'fruits_veg', 'other'],
      default: 'cooked',
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
    },
    unit: {
      type: String,
      default: 'kg',
    },
    expiryTime: {
      type: Date,
      required: [true, 'Expiry time is required'],
    },
    image: {
      type: String,
      default: '',
    },
    images: [
      {
        type: String,
      },
    ],
    pickupPhoto: {
      type: String,
      default: '',
    },
    location: {
      address: { type: String, default: '' },
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'cancelled'],
      default: 'available',
    },
    ngoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Donation', donationSchema);
