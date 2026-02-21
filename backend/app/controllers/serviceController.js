const Service = require("../models/service");
const mongoose = require("mongoose");

const DEFAULT_SERVICES = [
  {
    name: "General Consultation",
    description: "Professional consultation with experienced staff",
    durationMinutes: 30,
    price: 30
  },
  {
    name: "Skin Care Session",
    description: "Refreshing skin treatment for glowing results",
    durationMinutes: 45,
    price: 45
  },
  {
    name: "Business Coaching",
    description: "One on one growth and strategy guidance",
    durationMinutes: 60,
    price: 60
  },
  {
    name: "Salon Services",
    description: "Premium hair and beauty services",
    durationMinutes: 90,
    price: 75
  }
];

const ensureDefaultServices = async () => {
  const count = await Service.countDocuments();
  if (count === 0) {
    await Service.insertMany(DEFAULT_SERVICES);
  }
};

const getServices = async (req, res) => {
  try {
    await ensureDefaultServices();

    const services = await Service.find({ isActive: true }).sort({ createdAt: 1 });
    return res.status(200).json({ services });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch services." });
  }
};

const getAllServicesAdmin = async (req, res) => {
  try {
    await ensureDefaultServices();
    const services = await Service.find().sort({ createdAt: 1 });
    return res.status(200).json({ services });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch services." });
  }
};

const createService = async (req, res) => {
  try {
    const { name, description, durationMinutes, price, isActive } = req.body;

    if (!name || !durationMinutes) {
      return res.status(400).json({ message: "Name and durationMinutes are required." });
    }

    const existing = await Service.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" }
    });
    if (existing) {
      return res.status(409).json({ message: "Service with this name already exists." });
    }

    const service = await Service.create({
      name: name.trim(),
      description: description || "",
      durationMinutes: Number(durationMinutes),
      price: typeof price === "number" ? price : Number(price) || 0,
      isActive: typeof isActive === "boolean" ? isActive : true,
      createdBy: req.user?._id
    });

    return res.status(201).json({ message: "Service created successfully.", service });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create service." });
  }
};

const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid service id." });
    }

    const allowedFields = ["name", "description", "durationMinutes", "price", "isActive"];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.name) {
      const existing = await Service.findOne({
        _id: { $ne: id },
        name: { $regex: `^${String(updates.name).trim()}$`, $options: "i" }
      });
      if (existing) {
        return res.status(409).json({ message: "Service with this name already exists." });
      }
      updates.name = String(updates.name).trim();
    }

    const service = await Service.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    return res.status(200).json({ message: "Service updated successfully.", service });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update service." });
  }
};

module.exports = {
  getServices,
  getAllServicesAdmin,
  createService,
  updateService
};
