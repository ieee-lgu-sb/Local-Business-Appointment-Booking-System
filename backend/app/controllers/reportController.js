const Appointment = require("../models/appointment");

const buildDateRange = () => {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    now,
    startOfToday,
    startOfTomorrow,
    startOfMonth,
    startOfNextMonth
  };
};

const buildDailyTrend = async (days = 7) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const end = new Date(today);
  end.setDate(end.getDate() + 1);

  const grouped = await Appointment.aggregate([
    {
      $match: {
        appointmentDate: {
          $gte: start,
          $lt: end
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$appointmentDate"
          }
        },
        total: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const countMap = grouped.reduce((acc, item) => {
    acc[item._id] = item.total;
    return acc;
  }, {});

  const trend = [];
  for (let offset = 0; offset < days; offset += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + offset);
    const key = current.toISOString().split("T")[0];
    trend.push({
      key,
      label: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total: countMap[key] || 0
    });
  }

  return trend;
};

const buildMonthlyTrend = async (months = 6) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const grouped = await Appointment.aggregate([
    {
      $match: {
        appointmentDate: {
          $gte: start,
          $lt: end
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m",
            date: "$appointmentDate"
          }
        },
        total: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const countMap = grouped.reduce((acc, item) => {
    acc[item._id] = item.total;
    return acc;
  }, {});

  const trend = [];
  for (let offset = 0; offset < months; offset += 1) {
    const current = new Date(start.getFullYear(), start.getMonth() + offset, 1);
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    trend.push({
      key,
      label: current.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      total: countMap[key] || 0
    });
  }

  return trend;
};

const getReports = async (req, res) => {
  try {
    const { startOfToday, startOfTomorrow, startOfMonth, startOfNextMonth } = buildDateRange();

    const [totalAppointments, dailyAppointments, monthlyAppointments, statusRows, servicePerformance, dailyTrend, monthlyTrend] =
      await Promise.all([
        Appointment.countDocuments(),
        Appointment.countDocuments({
          appointmentDate: { $gte: startOfToday, $lt: startOfTomorrow }
        }),
        Appointment.countDocuments({
          appointmentDate: { $gte: startOfMonth, $lt: startOfNextMonth }
        }),
        Appointment.aggregate([
          {
            $group: {
              _id: "$status",
              total: { $sum: 1 }
            }
          }
        ]),
        Appointment.aggregate([
          {
            $lookup: {
              from: "services",
              localField: "service",
              foreignField: "_id",
              as: "serviceDoc"
            }
          },
          {
            $unwind: {
              path: "$serviceDoc",
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $group: {
              _id: "$service",
              serviceName: {
                $first: {
                  $ifNull: ["$serviceDoc.name", "Unknown service"]
                }
              },
              total: { $sum: 1 },
              completed: {
                $sum: {
                  $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
                }
              },
              cancelled: {
                $sum: {
                  $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0]
                }
              }
            }
          },
          { $sort: { total: -1, serviceName: 1 } }
        ]),
        buildDailyTrend(7),
        buildMonthlyTrend(6)
      ]);

    const statusBreakdown = {
      pending: 0,
      approved: 0,
      rescheduled: 0,
      cancelled: 0,
      completed: 0
    };

    statusRows.forEach((row) => {
      if (row._id && statusBreakdown[row._id] !== undefined) {
        statusBreakdown[row._id] = row.total;
      }
    });

    return res.status(200).json({
      reports: {
        totals: {
          today: dailyAppointments,
          month: monthlyAppointments,
          allTime: totalAppointments
        },
        statusBreakdown,
        dailyTrend,
        monthlyTrend,
        servicePerformance
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch reports." });
  }
};

module.exports = { getReports };
